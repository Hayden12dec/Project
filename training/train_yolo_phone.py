"""
YOLOv8 Model Training & Fine-Tuning Script
Demonstrates training a custom YOLOv8 model for examination-specific phone and device detection.
"""
import os
import argparse
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("train_yolo")

def train_custom_model(
    data_yaml="./dataset/phone_detection/data.yaml",
    base_model="yolov8n.pt",
    epochs=50,
    img_size=640,
    batch_size=16,
    save_dir="./models/weights"
):
    try:
        from ultralytics import YOLO
        logger.info(f"Loading base architecture: {base_model}...")
        model = YOLO(base_model)
        
        logger.info(f"Starting training on {data_yaml} for {epochs} epochs...")
        results = model.train(
            data=data_yaml,
            epochs=epochs,
            imgsz=img_size,
            batch=batch_size,
            project=save_dir,
            name="proctor_yolo_phone_v1"
        )
        
        logger.info("Training completed. Exporting best checkpoint...")
        best_weights = os.path.join(save_dir, "proctor_yolo_phone_v1", "weights", "best.pt")
        logger.info(f"Custom model weights saved at: {best_weights}")
        return results
    except Exception as e:
        logger.error(f"Training pipeline execution: {e}")
        logger.info("Note: In production and viva presentations, pretrained YOLOv8n handles COCO class 67 (cell phone) with high accuracy.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train custom YOLO detector for proctoring.")
    parser.add_argument("--epochs", type=int, default=30, help="Number of training epochs")
    parser.add_argument("--batch", type=int, default=16, help="Batch size")
    args = parser.parse_args()
    
    train_custom_model(epochs=args.epochs, batch_size=args.batch)
