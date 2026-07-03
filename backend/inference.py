from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from utils_image import ImageFeatures


@dataclass(frozen=True)
class ClassifierResult:
    class_name: str
    confidence: float
    all_probabilities: dict = field(default_factory=dict)


class KerasClassifier:
    def __init__(self, model_path: Path, classes: list[str]):
        self._model_path = model_path
        self._classes = classes
        self._model = None

    @property
    def classes(self) -> list[str]:
        return list(self._classes)

    def available(self) -> bool:
        # Check for both .keras and .h5 formats
        keras_path = self._model_path.with_suffix('.keras')
        h5_path = self._model_path.with_suffix('.h5')
        return keras_path.exists() or h5_path.exists() or self._model_path.exists()

    def _load(self):
        if self._model is not None:
            return
        import tensorflow as tf  # lazy import

        # Try .keras format first (newer), then .h5 (legacy)
        keras_path = self._model_path.with_suffix('.keras')
        h5_path = self._model_path.with_suffix('.h5')
        
        if keras_path.exists():
            self._model = tf.keras.models.load_model(str(keras_path))
            print(f"Loaded model from {keras_path}")
        elif h5_path.exists():
            self._model = tf.keras.models.load_model(str(h5_path))
            print(f"Loaded model from {h5_path}")
        elif self._model_path.exists():
            self._model = tf.keras.models.load_model(str(self._model_path))
            print(f"Loaded model from {self._model_path}")
        else:
            raise FileNotFoundError(f"No model found at {self._model_path}")

    def predict(self, input_tensor: np.ndarray) -> ClassifierResult:
        self._load()
        preds = self._model.predict(input_tensor, verbose=0)[0]
        idx = int(np.argmax(preds))
        all_probs = {cls: float(preds[i]) for i, cls in enumerate(self._classes)}
        return ClassifierResult(
            class_name=self._classes[idx],
            confidence=float(np.max(preds)),
            all_probabilities=all_probs,
        )


class HeuristicFruitClassifier:
    """Fallback classifier when no trained model exists.

    This is NOT a real ML model. It provides reasonable demo output for UI/API wiring.
    Replace it with a trained model as soon as possible.
    """

    def __init__(self):
        self._classes = ["unripe", "ripe", "overripe", "mold"]

    def available(self) -> bool:
        return True

    @property
    def classes(self) -> list[str]:
        return list(self._classes)

    def predict_from_features(self, features: ImageFeatures) -> ClassifierResult:
        # Very rough heuristics:
        # - red/purple-ish -> ripe
        # - low brightness -> overripe
        # - many dark+low-sat pixels -> mold (handled in app)

        h, s, v = features.color_hsv_mean

        if v < 60:
            return ClassifierResult("overripe", 0.55, {"unripe": 0.10, "ripe": 0.15, "overripe": 0.55, "mold": 0.20})

        # Hue for red wraps around in HSV; OpenCV hue range is [0..179].
        is_reddish = (h <= 10) or (h >= 160)
        if is_reddish and s > 60:
            return ClassifierResult("ripe", 0.60, {"unripe": 0.10, "ripe": 0.60, "overripe": 0.20, "mold": 0.10})

        if s < 35:
            return ClassifierResult("unripe", 0.40, {"unripe": 0.40, "ripe": 0.30, "overripe": 0.20, "mold": 0.10})

        return ClassifierResult("unripe", 0.55, {"unripe": 0.55, "ripe": 0.25, "overripe": 0.10, "mold": 0.10})


class NotBignayClassifier(KerasClassifier):
    """Binary classifier: bignay vs not_bignay.
    Used as a pre-filter before fruit/leaf classification.
    """

    def __init__(self, model_path: Path):
        super().__init__(model_path, classes=["bignay", "not_bignay"])

    def is_bignay(self, input_tensor: np.ndarray, threshold: float = 0.50) -> dict:
        """Check if the image is a Bignay.
        Returns dict with is_bignay bool, confidence, and probabilities.
        """
        if not self.available():
            return {"is_bignay": True, "confidence": 0.0, "model_available": False}

        result = self.predict(input_tensor)
        bignay_prob = result.all_probabilities.get("bignay", 0.0)
        not_bignay_prob = result.all_probabilities.get("not_bignay", 0.0)

        return {
            "is_bignay": bignay_prob >= threshold,
            "confidence": bignay_prob if bignay_prob >= threshold else not_bignay_prob,
            "bignay_probability": bignay_prob,
            "not_bignay_probability": not_bignay_prob,
            "model_available": True,
            "threshold": threshold,
        }


class HeuristicLeafClassifier:
    def __init__(self):
        self._classes = ["healthy", "mold"]

    def available(self) -> bool:
        return True

    @property
    def classes(self) -> list[str]:
        return list(self._classes)

    def predict_from_features(self, features: ImageFeatures) -> ClassifierResult:
        _, s, v = features.color_hsv_mean

        # crude guess: very dark or desaturated might indicate disease/mold
        if v < 70 and s < 80:
            return ClassifierResult("mold", 0.55, {"healthy": 0.45, "mold": 0.55})
        return ClassifierResult("healthy", 0.60, {"healthy": 0.60, "mold": 0.40})
