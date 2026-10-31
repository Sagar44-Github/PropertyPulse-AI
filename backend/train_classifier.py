import json
import random
from pathlib import Path

import joblib
import numpy as np
from datasets import load_dataset
from PIL import Image, ImageOps
from sklearn.linear_model import SGDClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import train_test_split
from skimage.feature import hog

BACKEND = Path(__file__).resolve().parent
MODEL_DIR = BACKEND / "models"
SAMPLE_DIR = BACKEND / "samples"
MODEL_DIR.mkdir(parents=True, exist_ok=True)
SAMPLE_DIR.mkdir(parents=True, exist_ok=True)
DATASET_ID = "chandrabhuma/building_defect_vqa"
SEED = 42
random.seed(SEED)
np.random.seed(SEED)


def image_features(image):
    image = ImageOps.exif_transpose(image).convert("L").resize((128, 128))
    pixels = np.asarray(image, dtype=np.float32) / 255.0
    return hog(
        pixels,
        orientations=9,
        pixels_per_cell=(8, 8),
        cells_per_block=(2, 2),
        block_norm="L2-Hys",
        feature_vector=True,
    )


def main():
    print("Loading openly licensed building-defect images…", flush=True)
    dataset = load_dataset(DATASET_ID)
    split_name = "train" if "train" in dataset else next(iter(dataset.keys()))
    split = dataset[split_name]
    features = []
    labels = []
    sample_saved = set()
    for index, record in enumerate(split):
        image = record["image"]
        label = str(record.get("answer", "")).strip().lower()
        if not label or image is None:
            continue
        features.append(image_features(image))
        labels.append(label)
        if label not in sample_saved:
            image.convert("RGB").save(SAMPLE_DIR / (label.replace(" ", "_") + ".jpg"), quality=92)
            sample_saved.add(label)
        if (index + 1) % 250 == 0:
            print("Prepared", index + 1, "images", flush=True)

    if len(set(labels)) < 2:
        raise RuntimeError("The source dataset did not return enough labeled classes.")
    x = np.asarray(features, dtype=np.float32)
    y = np.asarray(labels)
    x_train, x_test, y_train, y_test = train_test_split(
        x, y, test_size=0.20, stratify=y, random_state=SEED
    )
    print("Training image-level classifier on", len(y_train), "images…", flush=True)
    model = SGDClassifier(
        loss="log_loss",
        alpha=0.0001,
        max_iter=1500,
        tol=0.001,
        class_weight="balanced",
        random_state=SEED,
    )
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)
    accuracy = float(accuracy_score(y_test, predictions))
    macro_f1 = float(f1_score(y_test, predictions, average="macro"))
    report = classification_report(y_test, predictions, output_dict=True, zero_division=0)
    metrics = {
        "holdout_accuracy": round(accuracy, 4),
        "holdout_macro_f1": round(macro_f1, 4),
        "holdout_size": int(len(y_test)),
        "class_report": report,
        "confusion_matrix": {
            "labels": model.classes_.tolist(),
            "values": confusion_matrix(y_test, predictions, labels=model.classes_).tolist(),
        },
    }
    version = "bd3-hog-sgd-2026-10-31"
    bundle = {
        "model": model,
        "version": version,
        "dataset": DATASET_ID,
        "dataset_license": "CC-BY-4.0",
        "seed": SEED,
        "image_count": int(len(y)),
    }
    joblib.dump(bundle, MODEL_DIR / "propertypulse_classifier.joblib", compress=3)
    info = {
        "version": version,
        "dataset": DATASET_ID,
        "dataset_license": "CC-BY-4.0",
        "dataset_rows_used": int(len(y)),
        "labels": sorted(set(labels)),
        "seed": SEED,
        "feature_extractor": "HOG, grayscale 128x128, 9 orientations, 8x8 pixels per cell",
        "classifier": "SGDClassifier with log-loss and balanced class weights",
        "metrics": metrics,
        "warning": "Image-level research model. Holdout results are not a real-world accuracy guarantee or safety assessment.",
    }
    (MODEL_DIR / "model_info.json").write_text(json.dumps(info, indent=2), encoding="utf-8")
    print("Model saved:", MODEL_DIR / "propertypulse_classifier.joblib", flush=True)
    print("Holdout accuracy:", round(accuracy, 4), "macro F1:", round(macro_f1, 4), flush=True)
    print("Classes:", ", ".join(sorted(set(labels))), flush=True)


if __name__ == "__main__":
    main()
