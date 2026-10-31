import json
from pathlib import Path

import joblib
import numpy as np
from PIL import Image, ImageOps
from skimage.feature import hog

from .db import MODEL_DIR

MODEL_PATH = MODEL_DIR / "propertypulse_classifier.joblib"
MODEL_INFO_PATH = MODEL_DIR / "model_info.json"
CLASS_LABELS = {
    "major_crack": "Wall crack",
    "minor_crack": "Wall crack",
    "peeling": "Peeling paint",
    "spalling": "Surface damage",
    "stain": "Stain / dampness-like mark",
    "algae": "Surface growth",
    "plain": "No supported defect detected",
}
CLASS_NOTES = {
    "major_crack": "A visible crack-like surface pattern was classified. Photo analysis cannot determine depth or structural significance.",
    "minor_crack": "A fine crack-like surface pattern was classified. Confirm the area on site.",
    "peeling": "A peeling or flaking surface pattern was classified.",
    "spalling": "A surface-loss pattern was classified. Confirm material condition on site.",
    "stain": "A stain-like surface pattern was classified; the image alone cannot confirm moisture or its source.",
    "algae": "A surface-growth-like pattern was classified.",
    "plain": "The image was classified as a clear surface in the training label set. This does not rule out other defects.",
}


class ModelUnavailable(RuntimeError):
    pass


class PropertyClassifier:
    def __init__(self):
        self.bundle = None
        self.error = None
        if MODEL_PATH.exists():
            try:
                self.bundle = joblib.load(MODEL_PATH)
            except Exception as exc:
                self.error = str(exc)

    @property
    def ready(self):
        return self.bundle is not None

    def status(self):
        info = {}
        if MODEL_INFO_PATH.exists():
            try:
                info = json.loads(MODEL_INFO_PATH.read_text(encoding="utf-8"))
            except Exception:
                info = {}
        return {
            "ready": self.ready,
            "model_name": "PropertyPulse Surface Classifier",
            "model_version": info.get("version", "untrained"),
            "classes": list(self.bundle["model"].classes_) if self.ready else list(CLASS_LABELS),
            "metrics": info.get("metrics"),
            "dataset": info.get("dataset"),
            "dataset_license": info.get("dataset_license"),
            "dataset_rows_used": info.get("dataset_rows_used"),
            "feature_extractor": info.get("feature_extractor"),
            "classifier_type": info.get("classifier"),
            "warning": info.get("warning"),
            "error": self.error,
        }

    @staticmethod
    def _features(image_path: str | Path):
        with Image.open(image_path) as source:
            image = ImageOps.exif_transpose(source).convert("L").resize((128, 128))
            pixels = np.asarray(image, dtype=np.float32) / 255.0
        return hog(
            pixels,
            orientations=9,
            pixels_per_cell=(8, 8),
            cells_per_block=(2, 2),
            block_norm="L2-Hys",
            feature_vector=True,
        ).reshape(1, -1)

    def classify(self, image_path: str | Path):
        if not self.ready:
            raise ModelUnavailable("The local surface classifier has not been trained yet.")
        features = self._features(image_path)
        model = self.bundle["model"]
        probabilities = model.predict_proba(features)[0]
        order = np.argsort(probabilities)[::-1]
        source_label = str(model.classes_[int(order[0])])
        confidence = float(probabilities[int(order[0])])
        label = CLASS_LABELS.get(source_label, "Visible surface issue")
        return {
            "source_label": source_label,
            "defect_type": label,
            "confidence": round(confidence, 4),
            "uncertain": confidence < 0.48,
            "evidence_text": CLASS_NOTES.get(source_label, "A visible surface pattern was classified."),
            "model_name": "PropertyPulse Surface Classifier",
            "model_version": self.bundle.get("version", "local-hog-sgd-v1"),
            "model_type": "image classification",
            "localization": None,
            "top_predictions": [
                {
                    "source_label": str(model.classes_[int(index)]),
                    "label": CLASS_LABELS.get(str(model.classes_[int(index)]), str(model.classes_[int(index)])),
                    "score": round(float(probabilities[int(index)]), 4),
                }
                for index in order[:3]
            ],
            "limitations": [
                "Classification is image-level; the model does not locate pixels or measure physical size.",
                "Confidence is an uncalibrated model score, not structural-risk probability.",
                "A stain-like image does not establish active moisture or its cause.",
            ],
        }


classifier = PropertyClassifier()
