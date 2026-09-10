import base64
import os
import uuid
import cv2
import numpy as np
from datetime import datetime
from backend.config.settings import settings
import logging

logger = logging.getLogger(__name__)

def decode_base64_image(base64_str: str) -> np.ndarray:
    """Decodes base64 string (with or without data URI header) into OpenCV BGR image."""
    try:
        if "," in base64_str:
            base64_str = base64_str.split(",", 1)[1]
        img_bytes = base64.b64decode(base64_str)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return img
    except Exception as e:
        logger.error(f"Failed to decode base64 image: {e}")
        return None

def encode_image_to_base64(img: np.ndarray, format: str = ".jpg") -> str:
    """Encodes OpenCV image array to base64 JPEG string."""
    try:
        _, buffer = cv2.imencode(format, img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        base64_str = base64.b64encode(buffer).decode("utf-8")
        return f"data:image/jpeg;base64,{base64_str}"
    except Exception as e:
        logger.error(f"Failed to encode image to base64: {e}")
        return ""

def save_evidence_image(img: np.ndarray, student_id: str, exam_id: str, event_type: str) -> str:
    """Saves OpenCV image to disk in evidence/ directory and returns relative URL path."""
    try:
        os.makedirs(settings.EVIDENCE_DIR, exist_ok=True)
        timestamp_str = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"{student_id}_{exam_id}_{event_type}_{timestamp_str}_{uuid.uuid4().hex[:6]}.jpg"
        filepath = os.path.join(settings.EVIDENCE_DIR, filename)
        cv2.imwrite(filepath, img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return f"/evidence/{filename}"
    except Exception as e:
        logger.error(f"Failed to save evidence image: {e}")
        return ""

def annotate_frame(
    img: np.ndarray,
    detections: list = None,
    head_pose: dict = None,
    events: list = None,
    suspicion_score: int = 0,
    debug_telemetry: dict = None
) -> np.ndarray:
    """Draws bounding boxes, head pose vectors, and telemetry overlay on frame."""
    if img is None:
        return None
    
    annotated = img.copy()
    h, w, _ = annotated.shape
    
    # 1. Draw Object & Face Bounding Boxes
    if detections:
        for det in detections:
            bbox = det.get("bbox") # [x1, y1, x2, y2]
            label = det.get("label", "Detection")
            conf = det.get("confidence", 1.0)
            color = det.get("color", (0, 255, 0))
            is_phone = det.get("is_phone", False) or "phone" in label.lower()
            
            if bbox and len(bbox) == 4:
                x1, y1, x2, y2 = [int(v) for v in bbox]
                # Thicker border for mobile phone
                thickness = 3 if is_phone else 2
                cv2.rectangle(annotated, (x1, y1), (x2, y2), color, thickness)
                
                if is_phone:
                    # Multi-line prominent header tag for Mobile Phone
                    line1 = "MOBILE PHONE"
                    line2 = f"Confidence: {conf:.2f}"
                    font = cv2.FONT_HERSHEY_SIMPLEX
                    scale = 0.5
                    
                    (tw1, th1), _ = cv2.getTextSize(line1, font, scale, 1)
                    (tw2, th2), _ = cv2.getTextSize(line2, font, scale, 1)
                    badge_w = max(tw1, tw2) + 12
                    badge_h = th1 + th2 + 16
                    
                    badge_y1 = max(0, y1 - badge_h)
                    badge_y2 = badge_y1 + badge_h
                    
                    # Filled badge banner (Dark red/black background with red border)
                    cv2.rectangle(annotated, (x1, badge_y1), (x1 + badge_w, badge_y2), (0, 0, 180), -1)
                    cv2.rectangle(annotated, (x1, badge_y1), (x1 + badge_w, badge_y2), (0, 0, 255), 1)
                    
                    # Text line 1: MOBILE PHONE
                    cv2.putText(
                        annotated,
                        line1,
                        (x1 + 6, badge_y1 + th1 + 4),
                        font,
                        scale,
                        (255, 255, 255),
                        2,
                        cv2.LINE_AA
                    )
                    # Text line 2: Confidence: 0.87
                    cv2.putText(
                        annotated,
                        line2,
                        (x1 + 6, badge_y1 + th1 + th2 + 10),
                        font,
                        scale * 0.9,
                        (220, 220, 220),
                        1,
                        cv2.LINE_AA
                    )
                else:
                    # Standard detection tag label
                    tag_text = f"{label} ({int(conf * 100)}%)"
                    (tw, th), _ = cv2.getTextSize(tag_text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                    cv2.rectangle(annotated, (x1, max(0, y1 - 22)), (x1 + tw + 8, y1), color, -1)
                    cv2.putText(
                        annotated,
                        tag_text,
                        (x1 + 4, max(14, y1 - 6)),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5,
                        (0, 0, 0) if sum(color) > 400 else (255, 255, 255),
                        1,
                        cv2.LINE_AA
                    )
    
    # 2. Draw Telemetry HUD
    # Header bar
    cv2.rectangle(annotated, (0, 0), (w, 32), (20, 20, 20), -1)
    
    # Score color
    if suspicion_score >= 60:
        score_color = (0, 0, 255) # Red
        risk_str = "HIGH RISK"
    elif suspicion_score >= 30:
        score_color = (0, 165, 255) # Orange
        risk_str = "MEDIUM RISK"
    else:
        score_color = (0, 255, 0) # Green
        risk_str = "LOW RISK"
        
    hud_text = f"AI PROCTOR | SCORE: {suspicion_score} ({risk_str})"
    cv2.putText(annotated, hud_text, (10, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, score_color, 2, cv2.LINE_AA)
    
    # Head Pose direction if available
    if head_pose:
        direction = head_pose.get("direction", "FORWARD")
        dir_text = f"GAZE: {direction}"
        cv2.putText(annotated, dir_text, (w - 180, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)

    # 3. Draw Debug HUD Overlay (when debug_telemetry is present)
    if debug_telemetry:
        dbg_y = 48
        dbg_bg_w = min(280, w - 20)
        dbg_bg_h = 110
        # Draw translucent debug box
        overlay = annotated.copy()
        cv2.rectangle(overlay, (10, dbg_y), (10 + dbg_bg_w, dbg_y + dbg_bg_h), (10, 15, 25), -1)
        cv2.addWeighted(overlay, 0.75, annotated, 0.25, 0, annotated)
        cv2.rectangle(annotated, (10, dbg_y), (10 + dbg_bg_w, dbg_y + dbg_bg_h), (50, 70, 90), 1)

        model_name = debug_telemetry.get("model_name", "YOLO")
        fps = debug_telemetry.get("fps", 0)
        dets_cnt = debug_telemetry.get("total_detections", 0)
        thresh = debug_telemetry.get("threshold", 0.40)
        phone_det = debug_telemetry.get("phone_detected", False)
        phone_conf = debug_telemetry.get("phone_confidence", 0.0)

        cv2.putText(annotated, f"DEBUG MODE | {model_name}", (16, dbg_y + 16), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 220, 255), 1, cv2.LINE_AA)
        cv2.putText(annotated, f"FPS: {fps} | Detections: {dets_cnt} | Thresh: {thresh}", (16, dbg_y + 34), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (200, 200, 200), 1, cv2.LINE_AA)
        
        status_color = (0, 0, 255) if phone_det else (0, 255, 0)
        status_txt = f"PHONE: DETECTED ({phone_conf:.2f})" if phone_det else "PHONE: NOT DETECTED"
        cv2.putText(annotated, status_txt, (16, dbg_y + 54), cv2.FONT_HERSHEY_SIMPLEX, 0.42, status_color, 1, cv2.LINE_AA)

        # List first 2 detected classes
        det_classes = debug_telemetry.get("detected_classes", [])
        classes_str = ", ".join(det_classes[:2]) if det_classes else "none"
        cv2.putText(annotated, f"Classes: {classes_str}", (16, dbg_y + 74), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (160, 160, 160), 1, cv2.LINE_AA)
        
    return annotated
