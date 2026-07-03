"""
Training Service for Bignay Classification (Improved)
=====================================================
Handles user-contributed training data and model retraining.

Improvements over original:
- Image quality validation (resolution, blur, brightness)
- Perceptual hash-based duplicate detection
- Image preprocessing & standardisation before saving
- Dataset balance analytics with per-class counts
- Batch contribution support
- Delete bad contributions
- Background retraining via subprocess integration with train_model.py
- Augmentation-aware dataset gap analysis
- Configurable auto-retrain threshold per subject
"""

from __future__ import annotations

import base64
import hashlib
import os
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock, Thread
from typing import Any

import cv2
import numpy as np
from pymongo import MongoClient, DESCENDING

from config import BACKEND_DIR, get_settings

settings = get_settings()

# ---------------------------------------------------------------------------
# Paths & constants
# ---------------------------------------------------------------------------
DATASET_DIR = BACKEND_DIR.parent / "dataset"
FRUIT_DATASET_DIR = DATASET_DIR / "fruit"
LEAF_DATASET_DIR = DATASET_DIR / "leaf"
MODEL_DIR = BACKEND_DIR / "model"
TRAIN_SCRIPT = BACKEND_DIR / "train_model.py"

FRUIT_CLASSES = ["good", "mold", "overripe", "ripe", "unripe"]
LEAF_CLASSES = ["healthy", "mold"]

# Configurable thresholds
MIN_CONTRIBUTIONS_FOR_RETRAIN = int(os.getenv("MIN_CONTRIBUTIONS_FOR_RETRAIN", "50"))
MIN_IMAGE_SIZE = int(os.getenv("MIN_IMAGE_SIZE", "64"))          # px
MAX_IMAGE_SIZE = int(os.getenv("MAX_IMAGE_SIZE", "4096"))        # px
SAVE_IMAGE_SIZE = int(os.getenv("SAVE_IMAGE_SIZE", "224"))       # resize target for dataset
BLUR_THRESHOLD = float(os.getenv("BLUR_THRESHOLD", "35.0"))      # Laplacian variance
MIN_BRIGHTNESS = int(os.getenv("MIN_BRIGHTNESS", "20"))          # 0-255
MAX_BRIGHTNESS = int(os.getenv("MAX_BRIGHTNESS", "245"))         # 0-255
PHASH_DUPLICATE_THRESHOLD = int(os.getenv("PHASH_DUPLICATE_THRESHOLD", "8"))  # hamming distance


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _decode_image(image_data_url: str) -> tuple[np.ndarray | None, bytes | None, str | None]:
    """Decode base64 data-URL -> (BGR image, raw bytes, error)."""
    try:
        if "," in image_data_url:
            raw = base64.b64decode(image_data_url.split(",", 1)[1])
        else:
            raw = base64.b64decode(image_data_url)
        arr = np.frombuffer(raw, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return None, None, "Could not decode image bytes"
        return img, raw, None
    except Exception as exc:
        return None, None, f"Image decode error: {exc}"


def _perceptual_hash(image: np.ndarray, hash_size: int = 16) -> str:
    """Compute a perceptual hash (pHash) of an image - hex string."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    resized = cv2.resize(gray, (hash_size + 1, hash_size))
    diff = resized[:, 1:] > resized[:, :-1]
    return "".join(str(int(b)) for row in diff for b in row)


def _hamming_distance(h1: str, h2: str) -> int:
    """Hamming distance between two equal-length binary hash strings."""
    return sum(c1 != c2 for c1, c2 in zip(h1, h2))


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _validate_image_quality(image: np.ndarray) -> dict[str, Any]:
    """
    Validate that an image meets quality standards for training.

    Returns: {"ok": bool, "issues": [...], "metrics": {...}}
    """
    h, w = image.shape[:2]
    issues: list[str] = []
    metrics: dict[str, Any] = {"height": h, "width": w}

    # --- Resolution ---
    if h < MIN_IMAGE_SIZE or w < MIN_IMAGE_SIZE:
        issues.append(f"Image too small ({w}x{h}). Minimum is {MIN_IMAGE_SIZE}x{MIN_IMAGE_SIZE}.")
    if h > MAX_IMAGE_SIZE or w > MAX_IMAGE_SIZE:
        issues.append(f"Image too large ({w}x{h}). Maximum is {MAX_IMAGE_SIZE}x{MAX_IMAGE_SIZE}.")

    # --- Blur detection (Laplacian variance) ---
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    lap_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    metrics["blur_score"] = round(float(lap_var), 2)
    if lap_var < BLUR_THRESHOLD:
        issues.append(f"Image appears blurry (score={lap_var:.1f}, threshold={BLUR_THRESHOLD}).")

    # --- Brightness ---
    brightness = float(gray.mean())
    metrics["brightness"] = round(brightness, 2)
    if brightness < MIN_BRIGHTNESS:
        issues.append(f"Image too dark (brightness={brightness:.0f}).")
    elif brightness > MAX_BRIGHTNESS:
        issues.append(f"Image too bright / washed-out (brightness={brightness:.0f}).")

    # --- Near-uniform / blank image ---
    std_dev = float(gray.std())
    metrics["std_dev"] = round(std_dev, 2)
    if std_dev < 10:
        issues.append("Image appears nearly uniform (possibly blank).")

    return {"ok": len(issues) == 0, "issues": issues, "metrics": metrics}


def _preprocess_for_dataset(image: np.ndarray, target_size: int = SAVE_IMAGE_SIZE) -> np.ndarray:
    """
    Resize and normalise the contributed image to the standard dataset size.
    Uses area interpolation for downscaling and cubic for upscaling.
    """
    h, w = image.shape[:2]
    interp = cv2.INTER_AREA if (h > target_size or w > target_size) else cv2.INTER_CUBIC
    return cv2.resize(image, (target_size, target_size), interpolation=interp)


def _count_dataset_images(data_dir: Path, classes: list[str]) -> dict[str, int]:
    """Count images per class in the dataset directory."""
    extensions = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"}
    counts: dict[str, int] = {}
    total = 0
    for cls in classes:
        cls_dir = data_dir / cls
        count = 0
        if cls_dir.exists():
            for f in cls_dir.iterdir():
                if f.suffix.lower() in extensions:
                    count += 1
        counts[cls] = count
        total += count
    counts["_total"] = total
    return counts


# ---------------------------------------------------------------------------
# Main service
# ---------------------------------------------------------------------------

class TrainingService:
    def save_missed_detection_contribution(
        self,
        subject: str,
        image_data_url: str,
        user_id: str | None = None,
        save_to_dataset: bool = True,
        skip_quality_check: bool = False,
    ) -> dict[str, Any]:
        """
        Save a user-confirmed bignay fruit or leaf that the system failed to detect.
        This helps the AI learn to recognize more real bignay fruit/leaf.
        """
        # Validate subject
        if subject not in {"fruit", "leaf"}:
            return {"success": False, "error": "Invalid subject. Must be 'fruit' or 'leaf'."}

        # Use special label for missed detection
        label = "not_detected"

        # Decode image
        image, raw_bytes, err = _decode_image(image_data_url)
        if err:
            return {"success": False, "error": err}

        # Quality validation
        quality: dict[str, Any] = {"ok": True, "issues": [], "metrics": {}}
        if not skip_quality_check:
            quality = _validate_image_quality(image)
            if not quality["ok"]:
                return {
                    "success": False,
                    "error": "Image did not pass quality checks.",
                    "quality_issues": quality["issues"],
                    "quality_metrics": quality["metrics"],
                }

        # Duplicate detection (across all labels for this subject)
        img_sha256 = _sha256(raw_bytes)
        img_phash = _perceptual_hash(image)
        if self._training_collection is not None:
            if self._training_collection.find_one({"sha256": img_sha256, "subject": subject}):
                return {"success": False, "error": "This exact image has already been contributed for this subject."}
            # Perceptual near-duplicate (any label for this subject)
            cursor = self._training_collection.find({"subject": subject, "phash": {"$exists": True}}, {"_id": 1, "phash": 1})
            for doc in cursor:
                if _hamming_distance(img_phash, doc["phash"]) <= PHASH_DUPLICATE_THRESHOLD:
                    return {
                        "success": False,
                        "error": "A very similar image has already been contributed for this subject.",
                        "similar_contribution_id": str(doc["_id"]),
                    }

        # Pre-process & save to dataset
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = str(uuid.uuid4())[:8]
        filename = f"missed_{timestamp}_{unique_id}.jpg"
        dataset_path: str | None = None
        if save_to_dataset:
            dataset_base = FRUIT_DATASET_DIR if subject == "fruit" else LEAF_DATASET_DIR
            label_dir = dataset_base / label
            label_dir.mkdir(parents=True, exist_ok=True)
            dest = label_dir / filename
            processed = _preprocess_for_dataset(image)
            cv2.imwrite(str(dest), processed, [cv2.IMWRITE_JPEG_QUALITY, 95])
            dataset_path = str(dest)

        # MongoDB record
        contribution = {
            "subject": subject,
            "label": label,
            "original_prediction": "not_detected",
            "original_confidence": 0.0,
            "is_correction": True,
            "user_id": user_id,
            "filename": filename,
            "dataset_path": dataset_path,
            "sha256": img_sha256,
            "phash": img_phash,
            "quality_metrics": quality.get("metrics", {}),
            "used_for_training": False,
            "created_at": datetime.now(timezone.utc),
        }
        contribution_id = None
        if self._training_collection is not None:
            try:
                result = self._training_collection.insert_one(contribution)
                contribution_id = str(result.inserted_id)
                self._update_stats(subject, label, True)
            except Exception as exc:
                print(f"MongoDB save error: {exc}")

        return {
            "success": True,
            "contribution_id": contribution_id,
            "filename": filename,
            "saved_to_dataset": dataset_path is not None,
            "quality_metrics": quality.get("metrics"),
            "message": "Thank you! This helps the AI learn to recognize bignay fruit/leaf even when it was missed.",
        }
    def __init__(self, mongodb_uri: str | None, db_name: str):
        """Service to manage training data contributions and model retraining."""
        self._client = None
        self._db = None
        self._training_collection = None
        self._stats_collection = None
        self._retrain_lock = Lock()
        self._retrain_process = None

        if mongodb_uri:
            try:
                self._client = MongoClient(mongodb_uri, serverSelectionTimeoutMS=5000)
                self._db = self._client[db_name]
                self._training_collection = self._db["training_contributions"]
                self._stats_collection = self._db["training_stats"]

                # Indexes
                self._training_collection.create_index("subject")
                self._training_collection.create_index("label")
                self._training_collection.create_index("created_at")
                self._training_collection.create_index("used_for_training")
                self._training_collection.create_index("sha256")
                self._training_collection.create_index("phash")

                print("✓ Training service initialised with MongoDB")
            except Exception as exc:
                print(f"✗ Training service MongoDB error: {exc}")
                self._client = None

    # ------------------------------------------------------------------
    # Availability
    # ------------------------------------------------------------------
    def is_available(self) -> bool:
        """Check if the training service is available."""
        return self._training_collection is not None

    # ------------------------------------------------------------------
    # Contribute
    # ------------------------------------------------------------------
    def save_training_contribution(
        self,
        subject: str,
        label: str,
        image_data_url: str,
        original_prediction: str,
        original_confidence: float,
        is_correction: bool,
        user_id: str | None = None,
        save_to_dataset: bool = True,
        skip_quality_check: bool = False,
    ) -> dict[str, Any]:
        """
        Save a single training contribution with quality & duplicate checks.

        Args:
            subject: 'fruit' or 'leaf'
            label: The confirmed/corrected label
            image_data_url: Base64 data URL of the image
            original_prediction: What the model predicted
            original_confidence: Model's confidence in original prediction
            is_correction: True if user corrected the prediction
            user_id: Optional user identifier
            save_to_dataset: Whether to save image to dataset folder
            skip_quality_check: Bypass blur/brightness/size validation

        Returns:
            Dict with status, quality metrics, and contribution details
        """
        # --- Validate subject / label ---
        if subject not in {"fruit", "leaf"}:
            return {"success": False, "error": "Invalid subject. Must be 'fruit' or 'leaf'."}

        valid_classes = FRUIT_CLASSES if subject == "fruit" else LEAF_CLASSES
        if label not in valid_classes:
            return {"success": False, "error": f"Invalid label '{label}' for {subject}. Valid: {valid_classes}"}

        # --- Decode image ---
        image, raw_bytes, err = _decode_image(image_data_url)
        if err:
            return {"success": False, "error": err}

        # --- Quality validation ---
        quality: dict[str, Any] = {"ok": True, "issues": [], "metrics": {}}
        if not skip_quality_check:
            quality = _validate_image_quality(image)
            if not quality["ok"]:
                return {
                    "success": False,
                    "error": "Image did not pass quality checks.",
                    "quality_issues": quality["issues"],
                    "quality_metrics": quality["metrics"],
                }

        # --- Duplicate detection ---
        img_sha256 = _sha256(raw_bytes)
        img_phash = _perceptual_hash(image)

        if self._training_collection is not None:
            # Exact duplicate
            if self._training_collection.find_one({"sha256": img_sha256}):
                return {"success": False, "error": "This exact image has already been contributed."}

            # Perceptual near-duplicate (same subject+label)
            near_dup = self._find_near_duplicate(subject, label, img_phash)
            if near_dup:
                return {
                    "success": False,
                    "error": "A very similar image has already been contributed.",
                    "similar_contribution_id": near_dup,
                }

        # --- Pre-process & save to dataset ---
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = str(uuid.uuid4())[:8]
        filename = f"contrib_{timestamp}_{unique_id}.jpg"
        dataset_path: str | None = None

        if save_to_dataset:
            dataset_base = FRUIT_DATASET_DIR if subject == "fruit" else LEAF_DATASET_DIR
            label_dir = dataset_base / label
            label_dir.mkdir(parents=True, exist_ok=True)
            dest = label_dir / filename

            processed = _preprocess_for_dataset(image)
            cv2.imwrite(str(dest), processed, [cv2.IMWRITE_JPEG_QUALITY, 95])
            dataset_path = str(dest)

        # --- MongoDB record ---
        contribution = {
            "subject": subject,
            "label": label,
            "original_prediction": original_prediction,
            "original_confidence": original_confidence,
            "is_correction": is_correction,
            "user_id": user_id,
            "filename": filename,
            "dataset_path": dataset_path,
            "sha256": img_sha256,
            "phash": img_phash,
            "quality_metrics": quality.get("metrics", {}),
            "used_for_training": False,
            "created_at": datetime.now(timezone.utc),
        }

        contribution_id = None
        if self._training_collection is not None:
            try:
                result = self._training_collection.insert_one(contribution)
                contribution_id = str(result.inserted_id)
                self._update_stats(subject, label, is_correction)
            except Exception as exc:
                print(f"MongoDB save error: {exc}")

        return {
            "success": True,
            "contribution_id": contribution_id,
            "filename": filename,
            "saved_to_dataset": dataset_path is not None,
            "quality_metrics": quality.get("metrics"),
            "message": "Thank you for your contribution! This helps improve the model.",
        }

    # ------------------------------------------------------------------
    # Batch contribute
    # ------------------------------------------------------------------
    def save_batch_contributions(
        self,
        contributions: list[dict[str, Any]],
        user_id: str | None = None,
    ) -> dict[str, Any]:
        """
        Process multiple contributions in a single call.

        Each item in *contributions* must have:
            subject, label, image, original_prediction, original_confidence, is_correction

        Returns aggregated results.
        """
        results: list[dict[str, Any]] = []
        success_count = 0
        fail_count = 0

        for idx, item in enumerate(contributions):
            res = self.save_training_contribution(
                subject=item.get("subject", ""),
                label=item.get("label", ""),
                image_data_url=item.get("image", ""),
                original_prediction=item.get("original_prediction", ""),
                original_confidence=item.get("original_confidence", 0.0),
                is_correction=item.get("is_correction", False),
                user_id=user_id or item.get("user_id"),
                save_to_dataset=item.get("save_to_dataset", True),
            )
            res["index"] = idx
            results.append(res)
            if res["success"]:
                success_count += 1
            else:
                fail_count += 1

        return {
            "success": success_count > 0,
            "total": len(contributions),
            "succeeded": success_count,
            "failed": fail_count,
            "results": results,
        }

    # ------------------------------------------------------------------
    # Near-duplicate finder
    # ------------------------------------------------------------------
    def _find_near_duplicate(self, subject: str, label: str, phash: str) -> str | None:
        """Return contribution _id string of a near-duplicate, or None."""
        if self._training_collection is None:
            return None
        try:
            cursor = self._training_collection.find(
                {"subject": subject, "label": label, "phash": {"$exists": True}},
                {"_id": 1, "phash": 1},
            )
            for doc in cursor:
                if _hamming_distance(phash, doc["phash"]) <= PHASH_DUPLICATE_THRESHOLD:
                    return str(doc["_id"])
        except Exception:
            pass
        return None

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------
    def _update_stats(self, subject: str, label: str, is_correction: bool):
        """Update training statistics."""
        if self._stats_collection is None:
            return
        try:
            self._stats_collection.update_one(
                {"_id": "global"},
                {
                    "$inc": {
                        "total_contributions": 1,
                        "total_corrections": 1 if is_correction else 0,
                        f"contributions_by_subject.{subject}": 1,
                        f"contributions_by_label.{subject}.{label}": 1,
                    },
                    "$set": {"last_contribution_at": datetime.now(timezone.utc)},
                },
                upsert=True,
            )
        except Exception as exc:
            print(f"Stats update error: {exc}")

    def get_training_stats(self) -> dict[str, Any]:
        """Get contribution statistics plus live dataset balance info."""
        if self._stats_collection is None:
            return {"available": False, "message": "Training stats not available (no MongoDB)"}

        try:
            stats = self._stats_collection.find_one({"_id": "global"})
            pending = 0
            if self._training_collection is not None:
                pending = self._training_collection.count_documents(
                    {"used_for_training": False}
                )

            # Live dataset counts
            fruit_counts = _count_dataset_images(FRUIT_DATASET_DIR, FRUIT_CLASSES)
            leaf_counts = _count_dataset_images(LEAF_DATASET_DIR, LEAF_CLASSES)

            base: dict[str, Any] = {
                "available": True,
                "total_contributions": 0,
                "total_corrections": 0,
                "contributions_by_subject": {},
                "contributions_by_label": {},
                "pending_for_training": pending,
                "min_for_retrain": MIN_CONTRIBUTIONS_FOR_RETRAIN,
                "ready_for_retrain": pending >= MIN_CONTRIBUTIONS_FOR_RETRAIN,
                "last_contribution_at": None,
                "dataset_balance": {
                    "fruit": fruit_counts,
                    "leaf": leaf_counts,
                },
                "retraining_in_progress": self._retrain_process is not None and self._retrain_process.poll() is None,
            }

            if stats:
                base.update({
                    "total_contributions": stats.get("total_contributions", 0),
                    "total_corrections": stats.get("total_corrections", 0),
                    "contributions_by_subject": stats.get("contributions_by_subject", {}),
                    "contributions_by_label": stats.get("contributions_by_label", {}),
                    "last_contribution_at": stats.get("last_contribution_at"),
                })

            return base
        except Exception as exc:
            return {"available": False, "error": str(exc)}

    # ------------------------------------------------------------------
    # Dataset balance / gap analysis
    # ------------------------------------------------------------------
    def get_dataset_balance(self) -> dict[str, Any]:
        """
        Detailed breakdown of dataset class distribution with imbalance warnings.
        """
        result: dict[str, Any] = {}
        for name, base_dir, classes in [
            ("fruit", FRUIT_DATASET_DIR, FRUIT_CLASSES),
            ("leaf", LEAF_DATASET_DIR, LEAF_CLASSES),
        ]:
            counts = _count_dataset_images(base_dir, classes)
            total = counts.pop("_total", 0)
            ideal_per_class = total // len(classes) if total else 0

            class_details = []
            for cls in classes:
                cnt = counts.get(cls, 0)
                ratio = cnt / total if total else 0
                gap = max(0, ideal_per_class - cnt)
                class_details.append({
                    "class": cls,
                    "count": cnt,
                    "ratio": round(ratio, 4),
                    "gap_to_balance": gap,
                })

            # Imbalance ratio: max_count / min_count
            non_zero = [d["count"] for d in class_details if d["count"] > 0]
            imbalance_ratio = round(max(non_zero) / min(non_zero), 2) if len(non_zero) > 1 else 1.0
            imbalanced = imbalance_ratio > 3.0

            result[name] = {
                "total_images": total,
                "classes": class_details,
                "imbalance_ratio": imbalance_ratio,
                "is_imbalanced": imbalanced,
                "recommendation": (
                    f"Dataset is imbalanced (ratio {imbalance_ratio}x). "
                    "Contribute more images to underrepresented classes or enable class_weight during training."
                    if imbalanced
                    else "Dataset balance looks reasonable."
                ),
            }
        return result

    # ------------------------------------------------------------------
    # Contribution history
    # ------------------------------------------------------------------
    def get_contribution_history(
        self,
        limit: int = 50,
        subject: str | None = None,
        label: str | None = None,
        user_id: str | None = None,
    ) -> list[dict]:
        """Get recent contributions with optional filters."""
        if self._training_collection is None:
            return []
        try:
            query: dict[str, Any] = {}
            if subject:
                query["subject"] = subject
            if label:
                query["label"] = label
            if user_id:
                query["user_id"] = user_id

            cursor = (
                self._training_collection.find(
                    query,
                    {
                        "_id": 1, "subject": 1, "label": 1,
                        "original_prediction": 1, "is_correction": 1,
                        "quality_metrics": 1,
                        "used_for_training": 1, "created_at": 1,
                        "user_id": 1,
                    },
                )
                .sort("created_at", DESCENDING)
                .limit(limit)
            )

            return [
                {
                    "id": str(doc["_id"]),
                    "subject": doc["subject"],
                    "label": doc["label"],
                    "original_prediction": doc.get("original_prediction"),
                    "is_correction": doc.get("is_correction", False),
                    "quality_metrics": doc.get("quality_metrics"),
                    "used_for_training": doc.get("used_for_training", False),
                    "user_id": doc.get("user_id"),
                    "created_at": (
                        doc["created_at"].isoformat() if doc.get("created_at") else None
                    ),
                }
                for doc in cursor
            ]
        except Exception as exc:
            print(f"Get history error: {exc}")
            return []

    def delete_contribution(self, contribution_id: str) -> dict[str, Any]:
        """Hard-delete a contribution and its dataset image."""
        if self._training_collection is None:
            return {"success": False, "error": "MongoDB not configured"}

        from bson import ObjectId

        try:
            doc = self._training_collection.find_one({"_id": ObjectId(contribution_id)})
            if not doc:
                return {"success": False, "error": "Contribution not found"}

            # Remove image file
            if doc.get("dataset_path"):
                path = Path(doc["dataset_path"])
                if path.exists():
                    path.unlink()

            self._training_collection.delete_one({"_id": ObjectId(contribution_id)})
            return {"success": True, "contribution_id": contribution_id}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    # ------------------------------------------------------------------
    # Retraining
    # ------------------------------------------------------------------
    def trigger_retrain(
        self,
        subject: str = "both",
        fine_tune: bool = False,
        force: bool = False,
    ) -> dict[str, Any]:
        """
        Trigger model retraining as a background subprocess.

        Args:
            subject: 'fruit', 'leaf', or 'both'
            fine_tune: enable fine-tuning phase
            force: bypass minimum contribution check
        """
        if self._training_collection is None:
            return {"success": False, "error": "MongoDB not configured"}

        # Check if a retrain is already running
        if self._retrain_process is not None and self._retrain_process.poll() is None:
            return {
                "success": False,
                "error": "A retraining process is already running.",
                "pid": self._retrain_process.pid,
            }

        try:
            pending = self._training_collection.count_documents(
                {"used_for_training": False}
            )

            if not force and pending < MIN_CONTRIBUTIONS_FOR_RETRAIN:
                return {
                    "success": False,
                    "error": (
                        f"Not enough contributions. "
                        f"Need {MIN_CONTRIBUTIONS_FOR_RETRAIN}, have {pending}. "
                        f"Use force=true to override."
                    ),
                    "pending": pending,
                    "required": MIN_CONTRIBUTIONS_FOR_RETRAIN,
                }

            # Build command
            cmd = [sys.executable, str(TRAIN_SCRIPT), "--subject", subject]
            if fine_tune:
                cmd.append("--fine-tune")

            # Launch in background
            with self._retrain_lock:
                self._retrain_process = subprocess.Popen(
                    cmd,
                    cwd=str(BACKEND_DIR),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                )

            # Mark contributions as used after training succeeds (background thread)
            Thread(
                target=self._mark_contributions_after_training,
                args=(self._retrain_process,),
                daemon=True,
            ).start()

            return {
                "success": True,
                "message": f"Retraining started for '{subject}' with {pending} new contributions.",
                "pid": self._retrain_process.pid,
                "fine_tune": fine_tune,
                "pending": pending,
            }
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    def _mark_contributions_after_training(self, proc: subprocess.Popen):
        """Wait for the training process to finish, then mark contributions as used."""
        try:
            proc.wait()
            if proc.returncode == 0 and self._training_collection is not None:
                self._training_collection.update_many(
                    {"used_for_training": False},
                    {
                        "$set": {
                            "used_for_training": True,
                            "trained_at": datetime.now(timezone.utc),
                        }
                    },
                )
                print("✓ Contributions marked as used after successful training")
            elif proc.returncode != 0:
                print(f"✗ Training process exited with code {proc.returncode}")
        except Exception as exc:
            print(f"Error in post-training handler: {exc}")

    def get_retrain_status(self) -> dict[str, Any]:
        """Check the status of the current / last retraining process."""
        if self._retrain_process is None:
            return {"running": False, "message": "No retraining has been triggered yet."}

        poll = self._retrain_process.poll()
        if poll is None:
            return {
                "running": True,
                "pid": self._retrain_process.pid,
                "message": "Retraining is in progress...",
            }

        return {
            "running": False,
            "pid": self._retrain_process.pid,
            "exit_code": poll,
            "message": "Training completed successfully." if poll == 0 else f"Training failed (exit code {poll}).",
        }

    def cancel_retrain(self) -> dict[str, Any]:
        """Cancel a running retraining process."""
        if self._retrain_process is None or self._retrain_process.poll() is not None:
            return {"success": False, "error": "No active retraining to cancel."}

        try:
            self._retrain_process.terminate()
            self._retrain_process.wait(timeout=10)
            return {"success": True, "message": "Retraining cancelled."}
        except Exception as exc:
            # Force kill
            try:
                self._retrain_process.kill()
            except Exception:
                pass
            return {"success": True, "message": f"Retraining force-killed after error: {exc}"}


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------
_training_service: TrainingService | None = None


def get_training_service() -> TrainingService:
    """Get or create the training service singleton."""
    global _training_service
    if _training_service is None:
        _training_service = TrainingService(settings.mongodb_uri, settings.mongodb_db)
    return _training_service
