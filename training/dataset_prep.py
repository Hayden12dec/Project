"""
Dataset Preparation Pipeline for Custom Phone & Unauthorized Object Detection
Prepares training, validation, and test splits formatted in YOLO format.
"""
import os
import shutil
import random
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dataset_prep")

DATASET_CONFIG_YAML = """# Dataset configuration for YOLOv8 Custom Examination Phone Detection
path: ./dataset/phone_detection
train: images/train
val: images/val
test: images/test

# Classes
names:
  0: mobile_phone
  1: cheat_sheet
  2: earphone
"""

def prepare_dataset_structure(base_dir="./dataset/phone_detection"):
    """Creates the YOLO directory hierarchy for custom dataset annotation."""
    for split in ["train", "val", "test"]:
        os.makedirs(os.path.join(base_dir, "images", split), exist_ok=True)
        os.makedirs(os.path.join(base_dir, "labels", split), exist_ok=True)
        
    yaml_path = os.path.join(base_dir, "data.yaml")
    with open(yaml_path, "w", encoding="utf-8") as f:
        f.write(DATASET_CONFIG_YAML)
        
    logger.info(f"Dataset hierarchy initialized at {base_dir}")
    logger.info(f"YAML configuration written to {yaml_path}")

if __name__ == "__main__":
    prepare_dataset_structure()
