import os
import time
import cv2
import numpy as np
import logging
from typing import List, Dict, Any, Optional, Tuple
from backend.config.settings import settings

logger = logging.getLogger(__name__)

# Standard target keywords for mobile phones and prohibited items
PHONE_KEYWORDS = ["cell phone", "mobile phone", "phone", "telephone", "smartphone"]
PROHIBITED_DEVICE_KEYWORDS = ["laptop", "tablet", "remote", "digital watch"]

class PhoneDetector:
    """
    Modular Object Detector for Mobile Phones and Electronic Devices using
    YOLOv8 with dynamic class resolution, temporal confirmation, and debug telemetry.
    """
    def __init__(
        self,
        model_path: str = settings.YOLO_MODEL_PATH,
        confidence_threshold: float = settings.PHONE_CONFIDENCE_THRESHOLD,
        debug_mode: bool = settings.PHONE_DETECTION_DEBUG,
        temporal_frames: int = settings.PHONE_TEMPORAL_FRAMES,
        temporal_window_sec: float = settings.PHONE_TEMPORAL_WINDOW_SECONDS
    ):
        self.model_path = model_path
        self.confidence_threshold = confidence_threshold
        self.debug_mode = debug_mode
        self.temporal_frames = temporal_frames
        self.temporal_window_sec = temporal_window_sec
        self.yolo_model = None
        self.phone_class_ids = set()
        self.prohibited_class_ids = set()
        self.model_names_map: Dict[int, str] = {}
        
        # Temporal tracking: attempt_id -> state dict
        self._temporal_state: Dict[str, Dict[str, Any]] = {}
        
        self._init_yolo()

    def _init_yolo(self):
        try:
            from ultralytics import YOLO
            # Load YOLO model
            self.yolo_model = YOLO(self.model_path)
            
            # Inspect model's actual class names dynamically (avoiding hardcoded ID bugs)
            if hasattr(self.yolo_model, "names") and self.yolo_model.names:
                self.model_names_map = {int(k): str(v) for k, v in self.yolo_model.names.items()}
            elif hasattr(self.yolo_model, "model") and hasattr(self.yolo_model.model, "names"):
                self.model_names_map = {int(k): str(v) for k, v in self.yolo_model.model.names.items()}

            self._discover_classes()

            # Warm-up inference so first camera frame executes at top speed without JIT lag
            warmup_img = np.zeros((384, 384, 3), dtype=np.uint8)
            target_classes = list(self.phone_class_ids.union(self.prohibited_class_ids))
            self.yolo_model(warmup_img, verbose=False, conf=0.20, imgsz=384, classes=target_classes if target_classes else None)

            logger.info(
                f"YOLO Object Detector loaded & warmed up from {self.model_path}. "
                f"Phone class IDs dynamically mapped: {self.phone_class_ids} ({[self.model_names_map.get(i) for i in self.phone_class_ids]})"
            )
        except Exception as e:
            logger.error(f"Failed to initialize YOLO Object Detector: {e}")
            self.yolo_model = None

    def _discover_classes(self):
        """Scans model names dynamically to find phone and prohibited device class IDs."""
        self.phone_class_ids.clear()
        self.prohibited_class_ids.clear()
        
        for cls_id, raw_name in self.model_names_map.items():
            name_lower = raw_name.lower().strip()
            
            # Check for phone keywords
            if any(kw in name_lower for kw in PHONE_KEYWORDS):
                self.phone_class_ids.add(cls_id)
            
            # Check for other prohibited devices
            elif any(kw in name_lower for kw in PROHIBITED_DEVICE_KEYWORDS):
                self.prohibited_class_ids.add(cls_id)
                
        # Safety fallback if model names map was empty or unexpected
        if not self.phone_class_ids:
            logger.warning("No phone classes found by keyword scan. Fallback to COCO class 67 (cell phone).")
            self.phone_class_ids.add(67)

    def is_phone_class(self, cls_id: int, class_name: Optional[str] = None) -> bool:
        """Determines if a class ID or name corresponds to a mobile phone."""
        if cls_id in self.phone_class_ids:
            return True
        if class_name:
            cn_lower = class_name.lower().strip()
            return any(kw in cn_lower for kw in PHONE_KEYWORDS)
        return False

    def is_prohibited_class(self, cls_id: int, class_name: Optional[str] = None) -> bool:
        """Determines if a class ID or name corresponds to a prohibited electronic device."""
        if cls_id in self.prohibited_class_ids:
            return True
        if class_name:
            cn_lower = class_name.lower().strip()
            return any(kw in cn_lower for kw in PROHIBITED_DEVICE_KEYWORDS)
        return False

    def detect_phones(self, image: np.ndarray, conf_threshold: Optional[float] = None) -> List[Dict[str, Any]]:
        """
        Detects cell phones and unauthorized electronic devices in a single frame.
        Returns:
            list of dicts: [
                {
                    "bbox": [x1, y1, x2, y2],
                    "confidence": float,
                    "label": "Mobile Phone" | "Laptop" | "Book",
                    "class_name": str,
                    "is_phone": bool,
                    "color": (0, 0, 255)
                }
            ]
        """
        analysis = self.detect_and_analyze(image, conf_threshold=conf_threshold, track_attempt_id=None)
        return analysis.get("detections", [])

    def detect_and_analyze(
        self,
        image: np.ndarray,
        conf_threshold: Optional[float] = None,
        track_attempt_id: Optional[str] = None,
        include_debug: Optional[bool] = None
    ) -> Dict[str, Any]:
        """
        Runs comprehensive object detection, applies temporal confirmation if attempt_id is provided,
        and generates debug telemetry.
        """
        start_time = time.perf_counter()
        
        threshold = conf_threshold if conf_threshold is not None else self.confidence_threshold
        debug_enabled = include_debug if include_debug is not None else self.debug_mode
        
        if image is None or image.size == 0 or self.yolo_model is None:
            return {
                "phone_detected": False,
                "phone_confirmed": False,
                "should_trigger_event": False,
                "max_confidence": 0.0,
                "detections": [],
                "all_detections": [],
                "debug_telemetry": self._build_debug_telemetry([], [], 0.0, 0.0, threshold) if debug_enabled else None
            }

        h, w = image.shape[:2]
        phone_detections: List[Dict[str, Any]] = []
        all_detections: List[Dict[str, Any]] = []
        max_phone_conf = 0.0

        target_classes = list(self.phone_class_ids.union(self.prohibited_class_ids))

        try:
            # Run YOLO inference with optimal real-time imgsz=384 and class filtering
            results = self.yolo_model(
                image,
                verbose=False,
                conf=threshold,
                imgsz=384,
                classes=target_classes if target_classes else None
            )
            
            for r in results:
                boxes = r.boxes
                if boxes is None or len(boxes) == 0:
                    continue

                for box in boxes:
                    cls_id = int(box.cls[0].item())
                    conf = float(box.conf[0].item())
                    
                    # Dynamically look up class name from model names map
                    raw_class_name = self.model_names_map.get(cls_id, self.yolo_model.names.get(cls_id, f"class_{cls_id}"))
                    
                    # Compute clamped coordinates
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    x1 = max(0, min(int(x1), w - 1))
                    y1 = max(0, min(int(y1), h - 1))
                    x2 = max(0, min(int(x2), w - 1))
                    y2 = max(0, min(int(y2), h - 1))

                    det_info = {
                        "bbox": [x1, y1, x2, y2],
                        "confidence": round(conf, 3),
                        "class_id": cls_id,
                        "class_name": raw_class_name,
                        "label": raw_class_name.title()
                    }
                    all_detections.append(det_info)

                    # Check if this detection is a mobile phone
                    if self.is_phone_class(cls_id, raw_class_name):
                        is_phone = True
                        label = "Mobile Phone"
                        color = (0, 0, 255) # Red for mobile phone
                        if conf > max_phone_conf:
                            max_phone_conf = conf
                    # Or a prohibited device (e.g. laptop, tablet)
                    elif self.is_prohibited_class(cls_id, raw_class_name):
                        is_phone = False
                        label = raw_class_name.title()
                        color = (0, 165, 255) # Orange for other prohibited device
                    else:
                        continue

                    phone_detections.append({
                        "bbox": [x1, y1, x2, y2],
                        "confidence": round(conf, 3),
                        "class_id": cls_id,
                        "class_name": raw_class_name,
                        "label": label,
                        "is_phone": is_phone,
                        "color": color
                    })

        except Exception as e:
            logger.error(f"YOLO object detection inference error: {e}", exc_info=True)

        # Filter out implausibly small or oddly shaped phone detections
        phone_detections = self._filter_valid_phone_boxes(phone_detections, h, w)

        # Temporal Confirmation Logic
        raw_phone_detected = len(phone_detections) > 0 and any(d.get("is_phone", False) for d in phone_detections)
        phone_confirmed = raw_phone_detected
        should_trigger_event = False

        if track_attempt_id:
            phone_confirmed, should_trigger_event = self._update_temporal_state(
                track_attempt_id,
                raw_phone_detected,
                max_phone_conf
            )
        else:
            # Single frame mode without attempt tracking
            phone_confirmed = raw_phone_detected
            should_trigger_event = raw_phone_detected

        inference_time = max(0.001, time.perf_counter() - start_time)

        result: Dict[str, Any] = {
            "phone_detected": raw_phone_detected,
            "phone_confirmed": phone_confirmed,
            "should_trigger_event": should_trigger_event,
            "max_confidence": round(max_phone_conf, 3),
            "detections": phone_detections,
            "all_detections": all_detections
        }

        if debug_enabled:
            result["debug_telemetry"] = self._build_debug_telemetry(
                phone_detections,
                all_detections,
                max_phone_conf,
                inference_time,
                threshold
            )

        return result

    def _update_temporal_state(
        self,
        attempt_id: str,
        phone_detected: bool,
        confidence: float
    ) -> Tuple[bool, bool]:
        """
        Maintains temporal multi-frame confirmation across frames.
        Returns:
            (phone_confirmed: bool, should_trigger_event: bool)
        """
        now = time.time()
        if attempt_id not in self._temporal_state:
            self._temporal_state[attempt_id] = {
                "consecutive_frames": 0,
                "first_detected_ts": 0.0,
                "last_detected_ts": 0.0,
                "incident_active": False,
                "missed_frames": 0
            }

        state = self._temporal_state[attempt_id]

        if phone_detected:
            state["missed_frames"] = 0
            state["consecutive_frames"] += 1
            state["last_detected_ts"] = now
            if state["first_detected_ts"] == 0.0:
                state["first_detected_ts"] = now

            duration = now - state["first_detected_ts"]

            # Immediate confirmation if temporal_frames <= 1, else sustained
            is_confirmed = (state["consecutive_frames"] >= self.temporal_frames) or (duration >= self.temporal_window_sec)

            if is_confirmed:
                if not state["incident_active"]:
                    # New confirmed incident!
                    state["incident_active"] = True
                    return True, True  # Trigger violation event
                else:
                    # Ongoing confirmed incident
                    return True, False  # Keep confirmed status, do not re-trigger violation event
            else:
                return False, False
        else:
            # Phone not detected in current frame
            state["missed_frames"] += 1
            
            # If absent for 2 consecutive frames, reset the active incident so future phone triggers a new event
            if state["missed_frames"] >= 2:
                state["consecutive_frames"] = 0
                state["first_detected_ts"] = 0.0
                state["incident_active"] = False

            return False, False

    def _filter_valid_phone_boxes(self, detections: List[Dict[str, Any]], frame_h: int, frame_w: int) -> List[Dict[str, Any]]:
        """
        Filters out implausibly small or oddly shaped phone detections to reduce false positives.
        A real phone in a webcam frame should have a minimum size and reasonable aspect ratio.
        """
        frame_area = max(1, frame_h * frame_w)
        valid = []

        for det in detections:
            bbox = det.get("bbox", [0, 0, 0, 0])
            box_w = max(1, bbox[2] - bbox[0])
            box_h = max(1, bbox[3] - bbox[1])
            box_area = box_w * box_h
            aspect_ratio = max(box_w, box_h) / min(box_w, box_h)

            # Reject boxes that are tiny noise (< 0.06% of frame or < 14px dimension)
            if box_area < frame_area * 0.0006 or box_w < 14 or box_h < 14:
                continue

            # Reject boxes with extreme aspect ratio (> 5.5:1) — unlikely to be a phone
            if aspect_ratio > 5.5:
                continue

            valid.append(det)

        return valid

    def reset_attempt(self, attempt_id: str):
        """Clears temporal state for a given attempt."""
        if attempt_id in self._temporal_state:
            del self._temporal_state[attempt_id]

    def _build_debug_telemetry(
        self,
        phone_detections: List[Dict[str, Any]],
        all_detections: List[Dict[str, Any]],
        max_phone_conf: float,
        inference_time: float,
        threshold: float
    ) -> Dict[str, Any]:
        """Builds diagnostic telemetry for development/debug visualization."""
        model_name = getattr(self.yolo_model, "model_name", os.path.basename(self.model_path)) if self.yolo_model else "None"
        fps = round(1.0 / inference_time, 1)
        
        detected_summary = [
            f"{d['class_name']}: {d['confidence']:.2f}" for d in all_detections
        ]
        
        return {
            "model_name": f"YOLOv8 ({model_name})",
            "model_classes_count": len(self.model_names_map),
            "phone_classes_monitored": [self.model_names_map.get(i, str(i)) for i in self.phone_class_ids],
            "total_detections": len(all_detections),
            "detected_classes": detected_summary,
            "phone_detected": len(phone_detections) > 0,
            "phone_confidence": round(max_phone_conf, 2),
            "phone_boxes": [d["bbox"] for d in phone_detections],
            "threshold": threshold,
            "inference_time_ms": round(inference_time * 1000, 2),
            "fps": fps
        }

phone_detector = PhoneDetector()
