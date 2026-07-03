from __future__ import annotations

import base64
import hashlib
import io
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np
from PIL import Image


@dataclass(frozen=True)
class ImageFeatures:
    image_sha256: str
    color_hsv_mean: list[float]
    color_lab_mean: list[float]
    size_px_diameter: float | None
    mask_coverage: float


def decode_data_url(data_url: str) -> bytes:
    if "," not in data_url:
        raise ValueError("Invalid data URL")
    b64_str = data_url.split(",", 1)[1]
    # Normalise URL-safe base64 (mobile clients may use - and _ instead of + and /)
    b64_str = b64_str.replace("-", "+").replace("_", "/")
    # Fix missing padding
    missing_padding = len(b64_str) % 4
    if missing_padding:
        b64_str += "=" * (4 - missing_padding)
    return base64.b64decode(b64_str)


def decode_image_bytes(img_bytes: bytes) -> np.ndarray:
    # Try OpenCV first (fast path)
    np_img = np.frombuffer(img_bytes, np.uint8)
    image = cv2.imdecode(np_img, cv2.IMREAD_COLOR)
    if image is not None:
        return image
    # Fallback to Pillow which handles more formats (HEIC, WebP, AVIF, etc.)
    try:
        pil_img = Image.open(io.BytesIO(img_bytes))
        pil_img = pil_img.convert("RGB")
        image = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        return image
    except Exception:
        pass
    raise ValueError("Could not decode image")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _largest_contour_mask(image_bgr: np.ndarray) -> tuple[np.ndarray, float]:
    h, w = image_bgr.shape[:2]

    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    s = hsv[:, :, 1]
    v = hsv[:, :, 2]

    # Combine saturation and value to get a decent foreground mask in many webcam setups.
    gray = cv2.addWeighted(s, 0.6, v, 0.4, 0)
    gray = cv2.GaussianBlur(gray, (7, 7), 0)

    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    kernel = np.ones((7, 7), np.uint8)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel, iterations=1)

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return np.zeros((h, w), dtype=np.uint8), 0.0

    contour = max(contours, key=cv2.contourArea)
    area = float(cv2.contourArea(contour))

    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.drawContours(mask, [contour], -1, 255, thickness=-1)

    coverage = area / float(h * w)
    return mask, coverage


def extract_features(image_bgr: np.ndarray) -> ImageFeatures:
    h, w = image_bgr.shape[:2]
    mask, coverage = _largest_contour_mask(image_bgr)

    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    lab = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2LAB)

    if coverage > 0.01:
        mask_bool = mask.astype(bool)
        hsv_pixels = hsv[mask_bool]
        lab_pixels = lab[mask_bool]
    else:
        hsv_pixels = hsv.reshape(-1, 3)
        lab_pixels = lab.reshape(-1, 3)

    hsv_mean = hsv_pixels.mean(axis=0).astype(float).tolist()
    lab_mean = lab_pixels.mean(axis=0).astype(float).tolist()

    size_px_diameter: float | None = None
    if coverage > 0.01:
        area = float(mask.sum() / 255.0)
        # Equivalent circular diameter from area
        size_px_diameter = float(np.sqrt(4.0 * area / np.pi))

    # Hash for dedupe/logging (not the image bytes themselves)
    # Caller should pass original bytes for accurate hash; here we hash a JPEG-encoded version.
    ok, encoded = cv2.imencode(".jpg", image_bgr)
    if not ok:
        encoded_bytes = image_bgr.tobytes()
    else:
        encoded_bytes = encoded.tobytes()

    return ImageFeatures(
        image_sha256=sha256_bytes(encoded_bytes),
        color_hsv_mean=hsv_mean,
        color_lab_mean=lab_mean,
        size_px_diameter=size_px_diameter,
        mask_coverage=float(coverage),
    )


def resize_for_model(image_bgr: np.ndarray, size: int = 224) -> np.ndarray:
    # Convert BGR (OpenCV) → RGB to match training (tf.image.decode_image → RGB)
    image = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    image = cv2.resize(image, (size, size), interpolation=cv2.INTER_AREA)
    image = image.astype(np.float32)
    # MobileNetV2 preprocess_input: scale [0, 255] → [-1, 1]
    image = image / 127.5 - 1.0
    return np.expand_dims(image, axis=0)


@dataclass(frozen=True)
class ImageQuality:
    """Assessment of image quality for better detection feedback."""
    blur_score: float  # 0-1, higher = sharper
    brightness_score: float  # 0-1, optimal around 0.5
    contrast_score: float  # 0-1, higher = better contrast
    subject_size_score: float  # 0-1, based on mask coverage
    overall_quality: str  # "good", "acceptable", "poor"
    issues: list  # List of detected issues
    recommendations: list  # Suggestions for better capture


def assess_image_quality(image_bgr: np.ndarray, mask_coverage: float) -> ImageQuality:
    """
    Assess image quality to provide actionable feedback for blurry or distant images.
    This helps users understand why detection might fail and how to improve it.
    """
    h, w = image_bgr.shape[:2]
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    
    # Blur detection using Laplacian variance
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    # Normalize blur score (typical range 0-2000+, we normalize to 0-1)
    blur_score = min(1.0, laplacian_var / 500.0)
    
    # Brightness assessment
    brightness = np.mean(gray) / 255.0
    # Optimal brightness around 0.4-0.6, penalize too dark/bright
    if 0.3 <= brightness <= 0.7:
        brightness_score = 1.0
    elif brightness < 0.3:
        brightness_score = brightness / 0.3
    else:
        brightness_score = (1.0 - brightness) / 0.3
    brightness_score = max(0.0, min(1.0, brightness_score))
    
    # Contrast assessment using standard deviation
    contrast = np.std(gray) / 128.0  # Normalize by half range
    contrast_score = min(1.0, contrast)
    
    # Subject size score based on mask coverage
    # Good coverage: 5-50%, too small < 5%, too large > 50%
    if 0.05 <= mask_coverage <= 0.50:
        subject_size_score = 1.0
    elif mask_coverage < 0.05:
        subject_size_score = mask_coverage / 0.05
    else:
        subject_size_score = max(0.3, 1.0 - (mask_coverage - 0.50) / 0.50)
    subject_size_score = max(0.0, min(1.0, subject_size_score))
    
    # Collect issues and recommendations
    issues = []
    recommendations = []
    
    blur_critical_threshold = 0.12
    blur_blurry_threshold = 0.30
    blur_slight_threshold = 0.45

    if blur_score < blur_critical_threshold:
        issues.append("Image appears very blurry")
        recommendations.append("Hold the camera steady and tap to focus before capturing")
    elif blur_score < blur_blurry_threshold:
        issues.append("Image appears blurry")
        recommendations.append("Hold the camera steady or tap to focus")
    elif blur_score < blur_slight_threshold:
        issues.append("Image is slightly out of focus")
        recommendations.append("Try focusing on the fruit/leaf")
    
    if brightness < 0.12:
        issues.append("Image is extremely dark")
        recommendations.append("The camera may be covered or there is no light. Move to a well-lit area.")
    elif brightness < 0.25:
        issues.append("Image is too dark")
        recommendations.append("Move to better lighting or use flash")
    elif brightness > 0.85:
        issues.append("Image is extremely bright / overexposed")
        recommendations.append("Camera is facing direct light. Point away from light sources.")
    elif brightness > 0.75:
        issues.append("Image is overexposed")
        recommendations.append("Reduce direct light or move to shade")
    
    if contrast_score < 0.15:
        issues.append("Very low contrast — image appears flat")
        recommendations.append("Ensure the fruit/leaf stands out from background")
    elif contrast_score < 0.3:
        issues.append("Low contrast detected")
        recommendations.append("Ensure the fruit/leaf stands out from background")
    
    if mask_coverage < 0.03:
        issues.append("Subject appears too far or small")
        recommendations.append("Move closer to the Bignay fruit or leaf")
    elif mask_coverage > 0.60:
        issues.append("Subject is too close")
        recommendations.append("Move back slightly to capture the whole fruit/leaf")
    
    # Calculate overall quality
    # Any single critical issue (very blurry, extremely dark/bright) → poor
    has_critical = (blur_score < blur_critical_threshold or brightness < 0.12 or brightness > 0.85 or contrast_score < 0.15)
    avg_score = (blur_score + brightness_score + contrast_score + subject_size_score) / 4.0
    
    if has_critical:
        overall_quality = "poor"
    elif avg_score >= 0.6 and len(issues) <= 1:
        overall_quality = "good"
    elif avg_score >= 0.4 and len(issues) <= 2:
        overall_quality = "acceptable"
    else:
        overall_quality = "poor"
    
    return ImageQuality(
        blur_score=round(blur_score, 3),
        brightness_score=round(brightness_score, 3),
        contrast_score=round(contrast_score, 3),
        subject_size_score=round(subject_size_score, 3),
        overall_quality=overall_quality,
        issues=issues,
        recommendations=recommendations
    )


def enhance_image_for_detection(image_bgr: np.ndarray) -> np.ndarray:
    """
    Apply image enhancement to improve detection for blurry/distant/poor quality images.
    This preprocessing helps the model recognize Bignay even in suboptimal conditions.
    """
    enhanced = image_bgr.copy()
    
    # 1. Denoise while preserving edges (helps with blurry images)
    enhanced = cv2.bilateralFilter(enhanced, 9, 75, 75)
    
    # 2. Adaptive histogram equalization for better contrast
    # Convert to LAB color space for better color preservation
    lab = cv2.cvtColor(enhanced, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    
    # Apply CLAHE (Contrast Limited Adaptive Histogram Equalization) to L channel
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l_channel = clahe.apply(l_channel)
    
    # Merge channels back
    lab = cv2.merge([l_channel, a_channel, b_channel])
    enhanced = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    
    # 3. Slight sharpening to improve edge detection
    kernel = np.array([[-1, -1, -1],
                       [-1, 9.5, -1],
                       [-1, -1, -1]]) / 1.5
    enhanced = cv2.filter2D(enhanced, -1, kernel)
    
    # Ensure values are in valid range
    enhanced = np.clip(enhanced, 0, 255).astype(np.uint8)
    
    return enhanced


def detect_leaf_regions(image_bgr: np.ndarray) -> dict:
    """
    Detect leaf regions in a fruit image using SHAPE + TEXTURE analysis,
    NOT just green color — because unripe Bignay fruit is also green.

    Differentiates leaves from unripe fruit by:
    - Leaves: large, elongated, low circularity, smooth uniform green
    - Unripe fruit: small, round (high circularity), clustered
    """
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    img_h, img_w = image_bgr.shape[:2]
    total_pixels = img_h * img_w

    # Step 1: Find all green regions (both leaves AND potentially unripe fruit)
    lower_green = np.array([25, 35, 30])
    upper_green = np.array([90, 255, 255])
    green_mask = cv2.inRange(hsv, lower_green, upper_green)

    kernel = np.ones((5, 5), np.uint8)
    green_mask = cv2.morphologyEx(green_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    green_mask = cv2.morphologyEx(green_mask, cv2.MORPH_OPEN, kernel, iterations=1)

    green_coverage = float(np.sum(green_mask > 0)) / total_pixels
    if green_coverage < 0.02:
        # Almost no green — no leaf interference possible
        return {
            "leaf_coverage": 0.0,
            "has_significant_leaves": False,
            "has_minor_leaves": False,
            "leaf_detected": False,
            "warning": None,
        }

    # Step 2: Separate leaf-shaped from fruit-shaped green regions using contours
    contours, _ = cv2.findContours(green_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    leaf_mask = np.zeros((img_h, img_w), dtype=np.uint8)
    fruit_green_mask = np.zeros((img_h, img_w), dtype=np.uint8)
    min_contour_area = total_pixels * 0.002  # Ignore tiny noise

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_contour_area:
            continue

        perimeter = cv2.arcLength(cnt, True)
        if perimeter == 0:
            continue

        # Circularity: 1.0 = perfect circle, lower = elongated/irregular
        circularity = 4.0 * np.pi * area / (perimeter * perimeter)

        # Aspect ratio from bounding rect
        _, _, bw, bh = cv2.boundingRect(cnt)
        aspect_ratio = max(bw, bh) / max(min(bw, bh), 1)

        # Solidity: area / convex hull area
        hull = cv2.convexHull(cnt)
        hull_area = cv2.contourArea(hull)
        solidity = area / max(hull_area, 1)

        # Size relative to image
        relative_size = area / total_pixels

        # Classification logic:
        # LEAF indicators: elongated (low circularity, high aspect ratio),
        #   large relative size, often has irregular edges
        # FRUIT indicators: round (high circularity), small clustered shapes,
        #   high solidity (compact)
        is_leaf = False

        if circularity < 0.35 and aspect_ratio > 1.8:
            # Elongated shape — very likely a leaf
            is_leaf = True
        elif circularity < 0.45 and relative_size > 0.05:
            # Large, not-round green region — likely leaf
            is_leaf = True
        elif relative_size > 0.15 and circularity < 0.55:
            # Very large green area covering significant image portion
            is_leaf = True

        if is_leaf:
            cv2.drawContours(leaf_mask, [cnt], -1, 255, thickness=-1)
        else:
            cv2.drawContours(fruit_green_mask, [cnt], -1, 255, thickness=-1)

    leaf_pixels = float(np.sum(leaf_mask > 0))
    leaf_coverage = leaf_pixels / total_pixels
    fruit_green_pixels = float(np.sum(fruit_green_mask > 0))
    fruit_green_coverage = fruit_green_pixels / total_pixels

    has_significant_leaves = leaf_coverage > 0.08
    has_minor_leaves = 0.03 < leaf_coverage <= 0.08

    return {
        "leaf_coverage": round(leaf_coverage, 4),
        "fruit_green_coverage": round(fruit_green_coverage, 4),
        "has_significant_leaves": has_significant_leaves,
        "has_minor_leaves": has_minor_leaves,
        "leaf_detected": leaf_coverage > 0.03,
        "warning": (
            "Significant leaf area detected in the image. The classification focuses on "
            "the fruit region, but for best accuracy capture the fruit with minimal leaves visible."
            if has_significant_leaves else
            "Minor leaf area detected — classification focuses on fruit regions."
            if has_minor_leaves else None
        ),
    }


# ---------------------------------------------------------------------------
# Bignay HSV Color-Based Ripeness Analysis
# ---------------------------------------------------------------------------
# Bignay fruit color stages (OpenCV HSV: H 0-179, S 0-255, V 0-255):
#   Unripe:   Green (H 25-65, S 40+, V 40+)
#   Ripe:     Dark red / purple (H 0-15 or 140-179, S 50+, V 30-200)
#   Overripe: Very dark purple / black (H 120-170, S 10-120, V 10-80)
#   Mold:     White spots (S < 40, V > 170) or black spots (S < 50, V < 25)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ColorRipenessResult:
    """HSV color-based ripeness assessment of bignay fruit."""
    stage: str              # "unripe", "ripe", "overripe", "mold", "mixed"
    confidence: float       # 0-1
    green_pct: float        # % of foreground pixels that are green (unripe)
    purple_red_pct: float   # % that are purple/red (ripe)
    dark_pct: float         # % that are very dark (overripe)
    white_spot_pct: float   # % that are white spots (potential mold)
    black_spot_pct: float   # % that are black spots (potential mold)
    details: list           # Human-readable findings


def analyze_fruit_color(image_bgr: np.ndarray) -> ColorRipenessResult:
    """
    Analyze the dominant color of fruit regions to determine ripeness stage
    using HSV thresholds specifically calibrated for Bignay fruit.

    This provides a secondary signal alongside the ML model to improve accuracy,
    especially when leaves might mislead the model.
    """
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    h_ch, s_ch, v_ch = cv2.split(hsv)

    # Get foreground mask (fruit/subject area)
    mask, coverage = _largest_contour_mask(image_bgr)
    if coverage < 0.01:
        # No clear foreground — analyze entire image
        fg_pixels_h = h_ch.ravel()
        fg_pixels_s = s_ch.ravel()
        fg_pixels_v = v_ch.ravel()
    else:
        fg_bool = mask.astype(bool)
        fg_pixels_h = h_ch[fg_bool]
        fg_pixels_s = s_ch[fg_bool]
        fg_pixels_v = v_ch[fg_bool]

    total_fg = len(fg_pixels_h)
    if total_fg == 0:
        return ColorRipenessResult(
            stage="unknown", confidence=0.0,
            green_pct=0.0, purple_red_pct=0.0, dark_pct=0.0,
            white_spot_pct=0.0, black_spot_pct=0.0, details=["No foreground detected"]
        )

    # --- Classify each foreground pixel ---
    # Green / unripe: H 25-70, S > 35, V > 35
    green_pixels = (
        (fg_pixels_h >= 25) & (fg_pixels_h <= 70) &
        (fg_pixels_s > 35) & (fg_pixels_v > 35)
    )

    # Purple/red / ripe: H 0-15 or H 140-179, S > 40, V 25-220
    ripe_low = (fg_pixels_h <= 15) & (fg_pixels_s > 40) & (fg_pixels_v > 25) & (fg_pixels_v < 220)
    ripe_high = (fg_pixels_h >= 140) & (fg_pixels_s > 40) & (fg_pixels_v > 25) & (fg_pixels_v < 220)
    purple_red_pixels = ripe_low | ripe_high

    # Very dark / overripe: V < 50 and S > 10 (dark purple-black, not mold-white)
    dark_pixels = (fg_pixels_v < 50) & (fg_pixels_s > 10)

    # White spots (potential mold): very high V, very low S
    white_spots = (fg_pixels_s < 40) & (fg_pixels_v > 170)

    # Black spots (potential mold): extremely dark AND desaturated (not just overripe dark purple)
    black_spots = (fg_pixels_v < 25) & (fg_pixels_s < 50)

    green_pct = float(np.sum(green_pixels)) / total_fg * 100
    purple_red_pct = float(np.sum(purple_red_pixels)) / total_fg * 100
    dark_pct = float(np.sum(dark_pixels)) / total_fg * 100
    white_spot_pct = float(np.sum(white_spots)) / total_fg * 100
    black_spot_pct = float(np.sum(black_spots)) / total_fg * 100

    details = []

    # --- Determine dominant stage ---
    # Threshold: which color dominates the foreground?
    dominant_stage = "mixed"
    confidence = 0.0

    # Check for mold first (white/black spots on fruit)
    mold_total = white_spot_pct + black_spot_pct
    if mold_total > 8.0:
        dominant_stage = "mold"
        confidence = min(0.95, 0.5 + mold_total / 40.0)
        if white_spot_pct > 5.0:
            details.append(f"White mold spots detected: {white_spot_pct:.1f}% of fruit area")
        if black_spot_pct > 5.0:
            details.append(f"Dark mold spots detected: {black_spot_pct:.1f}% of fruit area")
    elif green_pct > purple_red_pct and green_pct > dark_pct and green_pct > 20:
        dominant_stage = "unripe"
        confidence = min(0.95, green_pct / 80.0)
        details.append(f"Dominant green color ({green_pct:.1f}%) indicates unripe fruit")
    elif purple_red_pct > green_pct and purple_red_pct > dark_pct and purple_red_pct > 15:
        dominant_stage = "ripe"
        confidence = min(0.95, purple_red_pct / 70.0)
        details.append(f"Dominant purple/red color ({purple_red_pct:.1f}%) indicates ripe fruit")
    elif dark_pct > 30:
        # Could be overripe OR ripe (dark purple ripe bignay)
        # Distinguish by also checking if there's some purple/red component
        if purple_red_pct > 10:
            dominant_stage = "ripe"
            confidence = min(0.85, (dark_pct + purple_red_pct) / 80.0)
            details.append(f"Dark purple-red color indicates ripe to very ripe fruit")
        else:
            dominant_stage = "overripe"
            confidence = min(0.90, dark_pct / 70.0)
            details.append(f"Very dark coloring ({dark_pct:.1f}%) suggests overripe fruit")
    else:
        # Mixed or transitional
        if green_pct > 10 and purple_red_pct > 10:
            dominant_stage = "ripe"  # Transitioning, closer to ripe
            confidence = 0.45
            details.append("Mixed green and purple — fruit is transitioning toward ripe")
        elif green_pct > 10:
            dominant_stage = "unripe"
            confidence = 0.50
            details.append("Some green visible — fruit appears mostly unripe")
        else:
            dominant_stage = "ripe"
            confidence = 0.40
            details.append("Color analysis inconclusive, defaulting to model prediction")

    # Add white/black spot warnings even if not primary mold
    if mold_total > 3.0 and dominant_stage != "mold":
        details.append(f"Warning: some white/black spots detected ({mold_total:.1f}%) — monitor for mold")

    return ColorRipenessResult(
        stage=dominant_stage,
        confidence=round(confidence, 3),
        green_pct=round(green_pct, 1),
        purple_red_pct=round(purple_red_pct, 1),
        dark_pct=round(dark_pct, 1),
        white_spot_pct=round(white_spot_pct, 1),
        black_spot_pct=round(black_spot_pct, 1),
        details=details,
    )


# ---------------------------------------------------------------------------
# Mold Spot Detection (white/black spots on dark fruit)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class MoldSpotResult:
    """Result of visual mold-spot detection on fruit."""
    mold_detected: bool
    white_mold_pct: float
    black_mold_pct: float
    total_mold_pct: float
    spot_count: int         # Number of distinct mold spot clusters
    severity: str           # "none", "mild", "moderate", "severe"
    details: list


def detect_mold_spots(image_bgr: np.ndarray) -> MoldSpotResult:
    """
    Detect mold spots on Bignay fruit by looking for:
    - White spots/patches: high V, low S (fuzzy white mold on dark skin)
    - Black spots/patches: very low V, low S with irregular texture
      (different from normal dark-purple overripe skin which has higher S)

    Uses texture analysis to distinguish mold (fuzzy/irregular) from normal skin.
    """
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    h_ch, s_ch, v_ch = cv2.split(hsv)
    img_h, img_w = image_bgr.shape[:2]

    # Get foreground mask
    fg_mask, coverage = _largest_contour_mask(image_bgr)
    if coverage < 0.01:
        fg_mask = np.ones((img_h, img_w), dtype=np.uint8) * 255

    fg_bool = fg_mask > 0
    total_fg = max(int(np.sum(fg_bool)), 1)

    # --- Detect white mold spots ---
    # White spots: very low saturation + high value (bright white against dark fruit)
    white_mold_mask = np.zeros((img_h, img_w), dtype=np.uint8)
    white_cond = (s_ch < 45) & (v_ch > 160) & fg_bool
    white_mold_mask[white_cond] = 255

    # Texture filter: mold has higher local variance (fuzzy texture)
    # Compute local standard deviation using box filter
    gray_f = gray.astype(np.float64)
    mean_local = cv2.blur(gray_f, (9, 9))
    mean_sq_local = cv2.blur(gray_f * gray_f, (9, 9))
    local_var = np.sqrt(np.maximum(mean_sq_local - mean_local * mean_local, 0))

    # White mold should have some texture variation (fuzzy)
    # but we're lenient since some mold can appear smooth at low resolution
    texture_mask = local_var > 5.0
    white_mold_mask[~texture_mask & white_cond] = 0  # Remove smooth white areas

    # Clean up
    kernel_small = np.ones((3, 3), np.uint8)
    white_mold_mask = cv2.morphologyEx(white_mold_mask, cv2.MORPH_OPEN, kernel_small)
    white_mold_mask = cv2.morphologyEx(white_mold_mask, cv2.MORPH_CLOSE, kernel_small)

    # --- Detect black mold spots ---
    # Black mold: extremely dark AND desaturated (different from dark purple skin
    # which is dark but has purple hue/saturation)
    black_mold_mask = np.zeros((img_h, img_w), dtype=np.uint8)
    black_cond = (v_ch < 30) & (s_ch < 50) & fg_bool
    black_mold_mask[black_cond] = 255

    # Texture filter for black mold
    black_texture = local_var > 3.0
    black_mold_mask[~black_texture & black_cond] = 0

    black_mold_mask = cv2.morphologyEx(black_mold_mask, cv2.MORPH_OPEN, kernel_small)
    black_mold_mask = cv2.morphologyEx(black_mold_mask, cv2.MORPH_CLOSE, kernel_small)

    # --- Calculate metrics ---
    white_mold_pct = float(np.sum(white_mold_mask > 0)) / total_fg * 100
    black_mold_pct = float(np.sum(black_mold_mask > 0)) / total_fg * 100
    total_mold_pct = white_mold_pct + black_mold_pct

    # Count distinct mold spot clusters
    combined_mold = cv2.bitwise_or(white_mold_mask, black_mold_mask)
    spot_contours, _ = cv2.findContours(combined_mold, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    # Filter out very tiny noise spots
    min_spot_area = total_fg * 0.0005
    significant_spots = [c for c in spot_contours if cv2.contourArea(c) > min_spot_area]
    spot_count = len(significant_spots)

    # Determine severity
    if total_mold_pct > 15 or spot_count > 8:
        severity = "severe"
    elif total_mold_pct > 5 or spot_count > 4:
        severity = "moderate"
    elif total_mold_pct > 1.5 or spot_count > 1:
        severity = "mild"
    else:
        severity = "none"

    mold_detected = severity != "none"

    details = []
    if white_mold_pct > 1.0:
        details.append(f"White mold spots: {white_mold_pct:.1f}% of fruit surface ({spot_count} cluster(s))")
    if black_mold_pct > 1.0:
        details.append(f"Black mold spots: {black_mold_pct:.1f}% of fruit surface")
    if mold_detected and not details:
        details.append(f"Minor mold indicators detected ({total_mold_pct:.1f}% of surface)")
    if not mold_detected:
        details.append("No significant mold spots detected on the fruit surface")

    return MoldSpotResult(
        mold_detected=mold_detected,
        white_mold_pct=round(white_mold_pct, 2),
        black_mold_pct=round(black_mold_pct, 2),
        total_mold_pct=round(total_mold_pct, 2),
        spot_count=spot_count,
        severity=severity,
        details=details,
    )


# ---------------------------------------------------------------------------
# Individual Fruit Object Detection
# ---------------------------------------------------------------------------
# Bignay fruits are small round/oval berries (~1–1.5 cm) that grow in dense
# clusters on a raceme.  This module detects individual berries even when they
# are grouped together, using colour segmentation + watershed separation +
# circularity filtering.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class DetectedFruit:
    """A single detected bignay fruit in the image."""
    id: int
    bbox: tuple          # (x, y, w, h) bounding rectangle
    center: tuple        # (cx, cy) centre point
    radius: int          # approximate radius in pixels
    area: int            # pixel area of the contour
    circularity: float   # 0–1, higher = more circular


def detect_fruit_objects(image_bgr: np.ndarray) -> dict:
    """
    Detect individual round/oval Bignay fruit objects in an image,
    even when fruits are grouped or clustered together.

    Algorithm
    ---------
    1. Colour segmentation for **all** ripeness stages (green → dark purple).
    2. Remove elongated/leaf-shaped contours.
    3. Distance-transform + watershed to split touching fruits.
    4. Circularity filtering (≥ 0.30) to keep only round/oval objects.

    Returns
    -------
    dict  with keys ``fruits`` (list[DetectedFruit]) and ``total_detected`` (int).
    """
    img_h, img_w = image_bgr.shape[:2]
    total_px = img_h * img_w

    # Adaptive size limits based on image resolution
    min_radius = max(6, min(img_h, img_w) // 100)
    max_radius = min(img_h, img_w) // 3
    min_area = int(np.pi * min_radius * min_radius * 0.5)

    # --- Pre-process ---
    blurred = cv2.GaussianBlur(image_bgr, (5, 5), 1.5)
    hsv = cv2.cvtColor(blurred, cv2.COLOR_BGR2HSV)
    _, s_ch, v_ch = cv2.split(hsv)

    # --- Build fruit colour mask (all ripeness stages) ---
    # Green / unripe
    green_mask = cv2.inRange(hsv, np.array([22, 35, 35]), np.array([78, 255, 255]))
    # Red (early ripe)
    red_low = cv2.inRange(hsv, np.array([0, 40, 25]), np.array([15, 255, 230]))
    red_high = cv2.inRange(hsv, np.array([165, 40, 25]), np.array([179, 255, 230]))
    red_mask = cv2.bitwise_or(red_low, red_high)
    # Purple / magenta (ripe)
    purple_mask = cv2.inRange(hsv, np.array([120, 25, 20]), np.array([165, 255, 210]))
    # Dark purple-black (overripe) – restrict to foreground to skip dark bg
    dark_mask = np.zeros((img_h, img_w), dtype=np.uint8)
    dark_cond = (v_ch < 80) & (s_ch > 12) & (v_ch > 5)
    fg_mask, fg_cov = _largest_contour_mask(image_bgr)
    if fg_cov > 0.02:
        dark_cond = dark_cond & (fg_mask > 0)
    dark_mask[dark_cond] = 255

    fruit_mask = green_mask.copy()
    fruit_mask = cv2.bitwise_or(fruit_mask, red_mask)
    fruit_mask = cv2.bitwise_or(fruit_mask, purple_mask)
    fruit_mask = cv2.bitwise_or(fruit_mask, dark_mask)

    # --- Morphological cleanup ---
    kernel = np.ones((5, 5), np.uint8)
    kernel_sm = np.ones((3, 3), np.uint8)
    fruit_mask = cv2.morphologyEx(fruit_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    fruit_mask = cv2.morphologyEx(fruit_mask, cv2.MORPH_OPEN, kernel_sm, iterations=1)

    # --- Remove leaf-shaped contours ---
    leaf_cnts, _ = cv2.findContours(fruit_mask.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for cnt in leaf_cnts:
        area = cv2.contourArea(cnt)
        if area < min_area:
            continue
        perimeter = cv2.arcLength(cnt, True)
        if perimeter == 0:
            continue
        circ = 4 * np.pi * area / (perimeter * perimeter)
        _, _, bw, bh = cv2.boundingRect(cnt)
        aspect = max(bw, bh) / max(min(bw, bh), 1)
        rel_size = area / total_px
        if circ < 0.30 and aspect > 2.0:
            cv2.drawContours(fruit_mask, [cnt], -1, 0, thickness=-1)
        elif circ < 0.35 and rel_size > 0.08:
            cv2.drawContours(fruit_mask, [cnt], -1, 0, thickness=-1)

    # --- Distance transform → watershed ---
    dist = cv2.distanceTransform(fruit_mask, cv2.DIST_L2, 5)
    if dist.max() == 0:
        return {"fruits": [], "total_detected": 0}

    _, sure_fg = cv2.threshold(dist, 0.35 * dist.max(), 255, 0)
    sure_fg = sure_fg.astype(np.uint8)

    sure_bg = cv2.dilate(fruit_mask, kernel, iterations=3)
    unknown = cv2.subtract(sure_bg, sure_fg)

    num_labels, markers_cc = cv2.connectedComponents(sure_fg)
    if num_labels <= 1:
        return _contour_based_detection(image_bgr, fruit_mask, min_radius, max_radius)

    markers = markers_cc + 1          # background = 1
    markers[unknown == 255] = 0       # unknown = 0
    markers = cv2.watershed(image_bgr.copy(), markers)

    # --- Extract individual fruit regions ---
    detected: list[DetectedFruit] = []
    for label_val in range(2, num_labels + 1):
        region = np.uint8(markers == label_val) * 255
        cnts, _ = cv2.findContours(region, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cnts:
            continue

        cnt = max(cnts, key=cv2.contourArea)
        area = cv2.contourArea(cnt)
        equiv_r = int(np.sqrt(area / np.pi))
        if equiv_r < min_radius or equiv_r > max_radius:
            continue

        perimeter = cv2.arcLength(cnt, True)
        if perimeter == 0:
            continue
        circularity = 4 * np.pi * area / (perimeter * perimeter)
        if circularity < 0.30:
            continue

        x, y, bw, bh = cv2.boundingRect(cnt)
        (cx, cy), r = cv2.minEnclosingCircle(cnt)
        cx, cy, r = int(cx), int(cy), max(int(r), 1)

        detected.append(DetectedFruit(
            id=0, bbox=(x, y, bw, bh), center=(cx, cy),
            radius=r, area=int(area), circularity=round(circularity, 3),
        ))

    # Stable ordering: top-left → bottom-right, then reassign IDs
    detected.sort(key=lambda f: (f.center[1] // 30, f.center[0]))
    detected = [
        DetectedFruit(id=i + 1, bbox=f.bbox, center=f.center,
                      radius=f.radius, area=f.area, circularity=f.circularity)
        for i, f in enumerate(detected)
    ]

    return {"fruits": detected, "total_detected": len(detected)}


def _contour_based_detection(
    image_bgr: np.ndarray,
    fruit_mask: np.ndarray,
    min_radius: int,
    max_radius: int,
) -> dict:
    """Fallback: simple contour detection when watershed cannot find clear markers."""
    cnts, _ = cv2.findContours(fruit_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    detected: list[DetectedFruit] = []

    for cnt in cnts:
        area = cv2.contourArea(cnt)
        equiv_r = int(np.sqrt(area / np.pi))
        if equiv_r < min_radius or equiv_r > max_radius:
            continue
        perimeter = cv2.arcLength(cnt, True)
        if perimeter == 0:
            continue
        circularity = 4 * np.pi * area / (perimeter * perimeter)
        if circularity < 0.30:
            continue

        x, y, bw, bh = cv2.boundingRect(cnt)
        (cx, cy), r = cv2.minEnclosingCircle(cnt)
        cx, cy, r = int(cx), int(cy), max(int(r), 1)

        detected.append(DetectedFruit(
            id=0, bbox=(x, y, bw, bh), center=(cx, cy),
            radius=r, area=int(area), circularity=round(circularity, 3),
        ))

    detected.sort(key=lambda f: (f.center[1] // 30, f.center[0]))
    detected = [
        DetectedFruit(id=i + 1, bbox=f.bbox, center=f.center,
                      radius=f.radius, area=f.area, circularity=f.circularity)
        for i, f in enumerate(detected)
    ]
    return {"fruits": detected, "total_detected": len(detected)}


# ---------------------------------------------------------------------------
# Per-fruit classification & annotated image helpers
# ---------------------------------------------------------------------------

def classify_single_fruit(
    image_bgr: np.ndarray,
    fruit: DetectedFruit,
    ml_model=None,
) -> dict:
    """
    Classify one detected fruit by cropping it from the source image and
    running colour analysis (+ optional ML model on larger crops).

    Returns dict with ``classification``, ``confidence``, ``color_stage``.
    """
    img_h, img_w = image_bgr.shape[:2]
    pad = max(4, int(fruit.radius * 0.25))
    x1 = max(0, fruit.bbox[0] - pad)
    y1 = max(0, fruit.bbox[1] - pad)
    x2 = min(img_w, fruit.bbox[0] + fruit.bbox[2] + pad)
    y2 = min(img_h, fruit.bbox[1] + fruit.bbox[3] + pad)
    crop = image_bgr[y1:y2, x1:x2]

    if crop.size == 0:
        return {"classification": "unknown", "confidence": 0.0, "color_stage": "unknown"}

    # Colour analysis (always available, fast)
    color = analyze_fruit_color(crop)

    # ML model on crops large enough to be meaningful (≥ 40 px in each dim)
    ml_class: str | None = None
    ml_conf = 0.0
    if ml_model is not None and min(crop.shape[:2]) >= 40:
        try:
            tensor = resize_for_model(crop, 224)
            pred = ml_model.predict(tensor)
            ml_class = pred.class_name
            ml_conf = pred.confidence
            if ml_class == "good":
                ml_class = "ripe"
        except Exception:
            pass

    # Combine: prefer ML when confident; fall back to colour analysis
    if ml_class and ml_conf > 0.55:
        final_class = ml_class
        final_conf = ml_conf
        # Colour-override when colour strongly disagrees
        if (color.confidence > 0.65
                and color.stage in ("ripe", "unripe", "overripe", "mold")
                and color.stage != ml_class
                and color.confidence > ml_conf):
            final_class = color.stage
            final_conf = color.confidence
    else:
        final_class = color.stage if color.stage not in ("mixed", "unknown") else "ripe"
        final_conf = color.confidence

    return {
        "classification": final_class,
        "confidence": round(final_conf, 3),
        "color_stage": color.stage,
    }


# BGR colour map used for drawing detection annotations
_CLASS_COLORS_BGR: dict[str, tuple[int, int, int]] = {
    "unripe":   (30, 200, 30),      # green
    "ripe":     (180, 50, 180),      # purple
    "overripe": (0, 140, 255),       # orange
    "mold":     (50, 50, 255),       # red
    "good":     (255, 180, 0),       # light-blue
    "mixed":    (200, 200, 100),     # teal-ish
    "unknown":  (180, 180, 180),     # grey
}


def generate_detection_image(
    image_bgr: np.ndarray,
    detected_fruits: list[DetectedFruit],
    classifications: dict[int, str] | None = None,
    max_dim: int = 640,
) -> np.ndarray:
    """
    Return a copy of *image_bgr* with coloured circles drawn around each
    detected fruit.  The circles are colour-coded by classification result.
    The image is resized so that the longest edge ≤ *max_dim*.
    """
    annotated = image_bgr.copy()
    img_h, img_w = annotated.shape[:2]

    for fruit in detected_fruits:
        cls = (classifications or {}).get(fruit.id, "unknown")
        color = _CLASS_COLORS_BGR.get(cls, _CLASS_COLORS_BGR["unknown"])

        # Circle
        cv2.circle(annotated, fruit.center, fruit.radius, color, 2)
        cv2.circle(annotated, fruit.center, 3, color, -1)

        # Label
        label = f"#{fruit.id}"
        fs = max(0.3, min(0.55, fruit.radius / 45.0))
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, fs, 1)
        tx = max(0, fruit.center[0] - tw // 2)
        ty = max(th + 2, fruit.center[1] - fruit.radius - 5)
        cv2.rectangle(annotated, (tx - 2, ty - th - 2), (tx + tw + 2, ty + 3), color, -1)
        cv2.putText(annotated, label, (tx, ty), cv2.FONT_HERSHEY_SIMPLEX, fs, (255, 255, 255), 1)

    # Summary badge in top-left
    badge = f"Detected: {len(detected_fruits)}"
    cv2.rectangle(annotated, (4, 4), (210, 34), (0, 0, 0), -1)
    cv2.putText(annotated, badge, (10, 27), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

    # Resize for efficient transfer
    if max(img_h, img_w) > max_dim:
        scale = max_dim / max(img_h, img_w)
        annotated = cv2.resize(annotated, (int(img_w * scale), int(img_h * scale)),
                               interpolation=cv2.INTER_AREA)
    return annotated


def encode_image_base64(image_bgr: np.ndarray, quality: int = 80) -> str:
    """Encode a BGR image as a JPEG base64 data-URL string."""
    params = [cv2.IMWRITE_JPEG_QUALITY, quality]
    ok, buf = cv2.imencode(".jpg", image_bgr, params)
    if not ok:
        raise ValueError("Failed to encode image to JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("ascii")


def safe_json(obj: Any) -> Any:
    if isinstance(obj, (str, int, float, bool)) or obj is None:
        return obj
    if isinstance(obj, dict):
        return {str(k): safe_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [safe_json(v) for v in obj]
    return str(obj)
