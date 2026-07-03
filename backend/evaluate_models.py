"""
Evaluate trained models and produce per-class metrics + confusion matrices.
Usage: python evaluate_models.py
"""

import os
import random
from pathlib import Path

import numpy as np
import tensorflow as tf
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score

SEED = 42
random.seed(SEED)
np.random.seed(SEED)
tf.random.set_seed(SEED)

SCRIPT_DIR = Path(__file__).parent.resolve()
DATASET_DIR = SCRIPT_DIR.parent / "dataset"
MODEL_DIR = SCRIPT_DIR / "model"

IMG_SIZE = 224
BATCH_SIZE = 32

FRUIT_CLASSES = ["good", "mold", "overripe", "ripe", "unripe"]
LEAF_CLASSES = ["healthy", "mold"]
NOT_BIGNAY_CLASSES = ["bignay", "not_bignay"]

IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']
NOT_BIGNAY_DIR = DATASET_DIR / "not fruit and leaf"


def load_and_preprocess_image(file_path):
    img = tf.io.read_file(file_path)
    img = tf.image.decode_image(img, channels=3, expand_animations=False)
    img.set_shape([None, None, 3])
    img = tf.image.resize(img, [IMG_SIZE, IMG_SIZE])
    img = preprocess_input(img)
    return img


def collect_paths_and_labels(data_dir, classes):
    file_paths = []
    labels = []
    class_to_idx = {cls: i for i, cls in enumerate(classes)}
    for cls in classes:
        cls_dir = data_dir / cls
        if not cls_dir.exists():
            continue
        for ext in IMAGE_EXTENSIONS:
            for f in cls_dir.glob(f'*{ext}'):
                file_paths.append(str(f))
                labels.append(class_to_idx[cls])
            for f in cls_dir.glob(f'*{ext.upper()}'):
                file_paths.append(str(f))
                labels.append(class_to_idx[cls])
    # deduplicate
    seen = set()
    up, ul = [], []
    for p, l in zip(file_paths, labels):
        if p not in seen:
            seen.add(p)
            up.append(p)
            ul.append(l)
    return up, ul


def collect_not_bignay_paths():
    positive_paths = []
    negative_paths = []
    fruit_dir = DATASET_DIR / "fruit"
    if fruit_dir.exists():
        for subfolder in fruit_dir.iterdir():
            if subfolder.is_dir():
                for ext in IMAGE_EXTENSIONS:
                    for f in subfolder.glob(f'*{ext}'):
                        positive_paths.append(str(f))
                    for f in subfolder.glob(f'*{ext.upper()}'):
                        positive_paths.append(str(f))
    leaf_dir = DATASET_DIR / "leaf"
    if leaf_dir.exists():
        for subfolder in leaf_dir.iterdir():
            if subfolder.is_dir():
                for ext in IMAGE_EXTENSIONS:
                    for f in subfolder.glob(f'*{ext}'):
                        positive_paths.append(str(f))
                    for f in subfolder.glob(f'*{ext.upper()}'):
                        positive_paths.append(str(f))
    if NOT_BIGNAY_DIR.exists():
        for ext in IMAGE_EXTENSIONS:
            for f in NOT_BIGNAY_DIR.glob(f'*{ext}'):
                negative_paths.append(str(f))
            for f in NOT_BIGNAY_DIR.glob(f'*{ext.upper()}'):
                negative_paths.append(str(f))
    positive_paths = list(set(positive_paths))
    negative_paths = list(set(negative_paths))
    return positive_paths, negative_paths


def make_dataset(file_paths, batch_size=BATCH_SIZE):
    ds = tf.data.Dataset.from_tensor_slices(file_paths)
    ds = ds.map(lambda p: load_and_preprocess_image(p), num_parallel_calls=tf.data.AUTOTUNE)
    ds = ds.batch(batch_size).prefetch(tf.data.AUTOTUNE)
    return ds


def get_val_split(file_paths, labels, val_split=0.2):
    combined = list(zip(file_paths, labels))
    random.shuffle(combined)
    split_idx = int(len(combined) * (1 - val_split))
    val_data = combined[split_idx:]
    val_paths, val_labels = zip(*val_data) if val_data else ([], [])
    return list(val_paths), list(val_labels)


def evaluate_model(model_path, file_paths, true_labels, class_names, model_name):
    print(f"\n{'='*70}")
    print(f"  Evaluating: {model_name}")
    print(f"  Model: {model_path}")
    print(f"  Samples: {len(file_paths)}")
    print(f"{'='*70}")

    model = tf.keras.models.load_model(str(model_path))
    ds = make_dataset(file_paths)
    predictions = model.predict(ds, verbose=1)
    pred_labels = np.argmax(predictions, axis=1)
    true_arr = np.array(true_labels)

    acc = accuracy_score(true_arr, pred_labels)
    print(f"\nOverall Accuracy: {acc*100:.2f}%\n")

    report = classification_report(true_arr, pred_labels, target_names=class_names, digits=4)
    print("Classification Report:")
    print(report)

    cm = confusion_matrix(true_arr, pred_labels)
    print("Confusion Matrix:")
    # Header
    header = "Predicted →  " + "  ".join(f"{c:>10}" for c in class_names)
    print(header)
    for i, cls in enumerate(class_names):
        row = f"Actual {cls:>10}  " + "  ".join(f"{cm[i][j]:>10}" for j in range(len(class_names)))
        print(row)
    print()

    return acc, report, cm


def main():
    print("=" * 70)
    print("  BIGNAY MODEL EVALUATION")
    print("=" * 70)

    # --- 1) FRUIT MODEL ---
    fruit_model_path = MODEL_DIR / "fruit_model.keras"
    if not fruit_model_path.exists():
        fruit_model_path = MODEL_DIR / "fruit_model.h5"
    if fruit_model_path.exists():
        fps, lbls = collect_paths_and_labels(DATASET_DIR / "fruit", FRUIT_CLASSES)
        val_paths, val_labels = get_val_split(fps, lbls, val_split=0.2)
        evaluate_model(fruit_model_path, val_paths, val_labels, FRUIT_CLASSES, "Fruit Classifier")
    else:
        print("Fruit model not found, skipping.")

    # --- 2) LEAF MODEL ---
    leaf_model_path = MODEL_DIR / "leaf_model.keras"
    if not leaf_model_path.exists():
        leaf_model_path = MODEL_DIR / "leaf_model.h5"
    if leaf_model_path.exists():
        fps, lbls = collect_paths_and_labels(DATASET_DIR / "leaf", LEAF_CLASSES)
        val_paths, val_labels = get_val_split(fps, lbls, val_split=0.2)
        evaluate_model(leaf_model_path, val_paths, val_labels, LEAF_CLASSES, "Leaf Classifier")
    else:
        print("Leaf model not found, skipping.")

    # --- 3) NOT_BIGNAY MODEL ---
    nb_model_path = MODEL_DIR / "not_bignay_model.keras"
    if not nb_model_path.exists():
        nb_model_path = MODEL_DIR / "not_bignay_model.h5"
    if nb_model_path.exists():
        pos_paths, neg_paths = collect_not_bignay_paths()
        # Balance
        min_count = min(len(pos_paths), len(neg_paths))
        random.shuffle(pos_paths)
        random.shuffle(neg_paths)
        pos_paths = pos_paths[:min_count]
        neg_paths = neg_paths[:min_count]
        all_paths = pos_paths + neg_paths
        all_labels = [0] * len(pos_paths) + [1] * len(neg_paths)
        val_paths, val_labels = get_val_split(all_paths, all_labels, val_split=0.2)
        evaluate_model(nb_model_path, val_paths, val_labels, NOT_BIGNAY_CLASSES, "NotBignay Classifier")
    else:
        print("NotBignay model not found, skipping.")


if __name__ == "__main__":
    main()
