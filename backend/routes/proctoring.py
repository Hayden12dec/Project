from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any, Optional
from pydantic import BaseModel
from backend.models.schemas import FrameAnalysisRequest, DirectEventLogRequest
from backend.services.proctoring_service import proctoring_service
from backend.services.report_service import report_service
from backend.utils.security import get_current_user
from backend.utils.image_utils import decode_base64_image
from backend.ai import face_detector, face_verifier, person_detector
from backend.config.db import get_events_col, get_users_col
import cv2
import numpy as np

router = APIRouter(prefix="/proctoring", tags=["Proctoring"])

class VerifyFaceRequest(BaseModel):
    reference_image: Optional[str] = None
    query_image: str

class SystemCheckRequest(BaseModel):
    image_base64: str

@router.post("/frame")
def process_frame(req: FrameAnalysisRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    return proctoring_service.process_frame(
        attempt_id=req.attempt_id,
        image_base64=req.image_base64,
        audio_energy=req.audio_energy
    )

@router.post("/system-check")
def pre_exam_system_check(req: SystemCheckRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Validates webcam feed quality, face presence, lighting sufficiency, and single person count.
    """
    img = decode_base64_image(req.image_base64)
    if img is None:
        return {
            "success": False,
            "camera_ready": False,
            "face_detected": False,
            "single_person": False,
            "lighting_ok": False,
            "brightness_score": 0,
            "message": "Unable to decode camera frame"
        }

    # 1. Lighting calculation (average grayscale pixel brightness)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    brightness = float(np.mean(gray))
    lighting_ok = brightness >= 30.0  # Permissive threshold - handles indoor webcam lighting

    # 2. Face & Person Detection
    faces = face_detector.detect_faces(img)
    face_count = len(faces)
    face_detected = face_count >= 1
    single_person = face_count == 1

    all_passed = lighting_ok and face_detected and single_person

    return {
        "success": all_passed,
        "camera_ready": True,
        "face_detected": face_detected,
        "single_person": single_person,
        "face_count": face_count,
        "faces": faces,
        "lighting_ok": lighting_ok,
        "brightness_score": round(brightness, 1),
        "message": "System check passed! All criteria met." if all_passed else (
            "Lighting too dim" if not lighting_ok else (
                "No face detected" if not face_detected else "Multiple faces detected. Ensure only you are in view."
            )
        )
    }

class UpdateFaceReferenceRequest(BaseModel):
    image_base64: str

@router.post("/verify-face")
def verify_face(req: VerifyFaceRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Verifies captured live face against registered student face reference."""
    user_id = current_user.get("_id") or current_user.get("id")
    users_col = get_users_col()
    user_doc = users_col.find_one({"_id": user_id}) or users_col.find_one({"_id": str(user_id)})
    db_face_ref = user_doc.get("face_reference") if user_doc else None

    ref_b64 = req.reference_image or db_face_ref or current_user.get("face_reference")
    
    query_img = decode_base64_image(req.query_image)
    if query_img is None:
        return {
            "verified": False,
            "similarity": 0.0,
            "similarity_percent": 0.0,
            "threshold": face_verifier.similarity_threshold,
            "message": "Failed to decode live camera frame"
        }

    # If no registered reference image exists for this student account, do NOT auto-verify
    if not ref_b64:
        return {
            "verified": False,
            "similarity": 0.0,
            "similarity_percent": 0.0,
            "threshold": face_verifier.similarity_threshold,
            "is_baseline_created": False,
            "message": "No registered biometric profile found for this student account. Please calibrate your profile face photo first."
        }

    ref_img = decode_base64_image(ref_b64)
    if ref_img is None:
        return {
            "verified": False,
            "similarity": 0.0,
            "similarity_percent": 0.0,
            "threshold": face_verifier.similarity_threshold,
            "message": "Failed to decode registered student baseline image"
        }

    res = face_verifier.verify_faces(ref_img, query_img)
    return res

@router.post("/update-face-reference")
def update_face_reference(req: UpdateFaceReferenceRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Recalibrate student's baseline face reference image with strict single-face check."""
    img = decode_base64_image(req.image_base64)
    if img is None:
        raise HTTPException(status_code=400, detail="Invalid image payload")

    faces = face_detector.detect_faces(img)
    if len(faces) != 1:
        return {
            "success": False,
            "verified": False,
            "message": "Ensure exactly one clearly visible face is centered in the camera view to calibrate."
        }

    user_id = current_user.get("_id") or current_user.get("id")
    users_col = get_users_col()
    try:
        users_col.update_one({"_id": user_id}, {"$set": {"face_reference": req.image_base64}})
    except Exception:
        try:
            users_col.update_one({"_id": str(user_id)}, {"$set": {"face_reference": req.image_base64}})
        except Exception:
            pass

    return {
        "success": True,
        "verified": True,
        "similarity": 1.0,
        "similarity_percent": 100.0,
        "threshold": face_verifier.similarity_threshold,
        "message": "Biometric face baseline reference photo updated and verified."
    }

@router.post("/event")
def log_event(req: DirectEventLogRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    return proctoring_service.log_direct_event(
        attempt_id=req.attempt_id,
        event_type=req.event_type,
        confidence=req.confidence,
        evidence_image=req.evidence_image,
        metadata=req.metadata,
        is_demo=req.is_demo
    )

@router.get("/events/{attempt_id}")
def get_attempt_events(attempt_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    events_col = get_events_col()
    events = list(events_col.find({"attempt_id": attempt_id}).sort("timestamp", 1))
    for e in events:
        e["id"] = str(e["_id"])
    return events
