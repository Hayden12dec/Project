from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any
from backend.models.schemas import DemoSimulateRequest
from backend.services.proctoring_service import proctoring_service
from backend.utils.security import get_current_user
from backend.config.settings import settings
import numpy as np
import cv2
from backend.utils.image_utils import encode_image_to_base64, save_evidence_image, annotate_frame

router = APIRouter(prefix="/demo", tags=["Demo & Viva Simulation Mode"])

DEMO_EVENT_CONFIGS = {
    "MOBILE_PHONE_DETECTED": {
        "label": "Demo: Mobile Phone Detected",
        "points": 50,
        "box": [180, 200, 320, 440],
        "color": (0, 0, 255)
    },
    "MULTIPLE_PERSONS_DETECTED": {
        "label": "Demo: Secondary Person In View",
        "points": 40,
        "box": [380, 100, 580, 420],
        "color": (0, 0, 255)
    },
    "SUSPICIOUS_HEAD_MOVEMENT": {
        "label": "Demo: Looking Right Repeatedly",
        "points": 10,
        "direction": "LOOKING_RIGHT",
        "color": (0, 165, 255)
    },
    "FACE_NOT_DETECTED": {
        "label": "Demo: Candidate Face Missing",
        "points": 20,
        "color": (0, 0, 255)
    },
    "AUDIO_ACTIVITY_DETECTED": {
        "label": "Demo: Acoustic Speech Energy Exceeded",
        "points": 20,
        "color": (0, 165, 255)
    }
}

@router.post("/simulate")
def simulate_event(req: DemoSimulateRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Simulates a proctoring detection for live viva demonstration.
    Generates a synthetic annotated evidence snapshot and logs the demo event.
    """
    if not settings.DEMO_MODE_ENABLED:
        raise HTTPException(status_code=403, detail="Demo simulation mode is disabled")

    cfg = DEMO_EVENT_CONFIGS.get(req.event_type, {
        "label": f"Demo: {req.event_type}",
        "points": 20,
        "color": (0, 0, 255)
    })

    # Generate synthetic demonstration evidence frame (640x480)
    demo_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    demo_frame[:] = (40, 40, 45) # Dark studio backdrop
    
    # Draw simulated silhouette
    cv2.circle(demo_frame, (320, 180), 90, (180, 160, 140), -1) # Head
    cv2.ellipse(demo_frame, (320, 380), (140, 120), 0, 0, 180, (120, 90, 70), -1) # Shoulders

    # Draw demo bounding box / indicator
    detections = []
    if "box" in cfg:
        detections.append({
            "bbox": cfg["box"],
            "label": cfg["label"],
            "confidence": req.confidence,
            "color": cfg["color"]
        })

    annotated = annotate_frame(
        demo_frame,
        detections=detections,
        head_pose={"direction": cfg.get("direction", "FORWARD")} if "direction" in cfg else None,
        suspicion_score=cfg["points"]
    )

    # Save demo evidence snapshot
    evidence_url = save_evidence_image(
        annotated,
        student_id=str(current_user.get("_id", "demo")),
        exam_id="demo_exam",
        event_type=f"DEMO_{req.event_type}"
    )

    # Log to attempt proctoring service
    res = proctoring_service.log_direct_event(
        attempt_id=req.attempt_id,
        event_type=req.event_type,
        confidence=req.confidence,
        evidence_image=evidence_url,
        metadata={"simulation": True, "demo_note": "Triggered via Viva Presentation Panel"},
        is_demo=True
    )

    res["evidence_image"] = evidence_url
    res["annotated_preview"] = encode_image_to_base64(annotated)
    return res
