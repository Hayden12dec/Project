from datetime import datetime
from typing import Dict, Any, List, Optional
import numpy as np
from backend.config.db import get_attempts_col, get_events_col, get_users_col
from backend.models.entities import EventTypeEnum, RiskLevelEnum
from backend.utils.image_utils import decode_base64_image, save_evidence_image, annotate_frame, encode_image_to_base64
from backend.ai import (
    face_detector,
    face_verifier,
    gaze_detector,
    person_detector,
    phone_detector,
    audio_detector,
    scoring_engine
)
from backend.config.settings import settings
import logging

logger = logging.getLogger(__name__)

class ProctoringService:
    def __init__(self):
        # In-memory store of latest annotated frame per attempt for admin live preview
        self.live_feeds: Dict[str, Dict[str, Any]] = {}
        self._frame_counters: Dict[str, int] = {}

    def process_frame(self, attempt_id: str, image_base64: str, audio_energy: float = 0.0) -> Dict[str, Any]:
        attempts_col = get_attempts_col()
        attempt = attempts_col.find_one({"_id": attempt_id})
        if not attempt:
            return {"error": "Attempt not found"}

        if attempt.get("status") != "in_progress":
            return {"status": attempt.get("status"), "message": "Exam attempt is not in progress"}

        student_id = attempt["student_id"]
        exam_id = attempt["exam_id"]
        
        frame = decode_base64_image(image_base64)
        if frame is None:
            return {"error": "Invalid frame data"}

        triggered_events = []
        detections = []
        
        # 1. Mobile Phone & Electronic Device Detection (Real-Time Priority)
        phone_res = phone_detector.detect_and_analyze(
            frame,
            track_attempt_id=attempt_id,
            include_debug=settings.PHONE_DETECTION_DEBUG
        )
        phone_dets = phone_res.get("detections", [])
        if phone_dets:
            detections.extend(phone_dets)

        if phone_res.get("should_trigger_event"):
            primary_phone = next((d for d in phone_dets if d.get("is_phone")), phone_dets[0] if phone_dets else {})
            triggered_events.append({
                "type": EventTypeEnum.MOBILE_PHONE_DETECTED,
                "confidence": phone_res.get("max_confidence", 0.90),
                "metadata": {
                    "label": primary_phone.get("label", "Mobile Phone"),
                    "bbox": primary_phone.get("bbox"),
                    "confidence": primary_phone.get("confidence", phone_res.get("max_confidence", 0.90)),
                    "temporal_confirmed": True
                }
            })

        # 2. Presence & Face Detection
        presence_res = person_detector.analyze_presence(frame)
        status_presence = presence_res.get("status")
        detected_faces = presence_res.get("faces", [])
        detections.extend(detected_faces)

        if status_presence == "STUDENT_ABSENT":
            triggered_events.append({
                "type": EventTypeEnum.STUDENT_ABSENT,
                "confidence": 0.95,
                "metadata": {"missing_frames": person_detector.consecutive_missing_frames}
            })
        elif status_presence == "FACE_NOT_DETECTED":
            triggered_events.append({
                "type": EventTypeEnum.FACE_NOT_DETECTED,
                "confidence": 0.85,
                "metadata": {}
            })
        elif status_presence == "MULTIPLE_PERSONS_DETECTED":
            triggered_events.append({
                "type": EventTypeEnum.MULTIPLE_PERSONS_DETECTED,
                "confidence": 0.90,
                "metadata": {"count": presence_res["person_count"]}
            })

        # 3. Head Pose & Gaze Monitoring (if at least one face present)
        head_pose_res = None
        if len(detected_faces) == 1:
            raw_lms = detected_faces[0].get("key_points_3d") or detected_faces[0].get("raw_landmarks")
            head_pose_res = gaze_detector.estimate_pose(frame, raw_landmarks=raw_lms)
            if head_pose_res.get("is_suspicious"):
                direction = head_pose_res.get("direction", "SUSPICIOUS")
                triggered_events.append({
                    "type": EventTypeEnum.SUSPICIOUS_HEAD_MOVEMENT,
                    "confidence": head_pose_res.get("confidence", 0.85),
                    "metadata": {
                        "direction": direction,
                        "yaw": head_pose_res.get("yaw"),
                        "pitch": head_pose_res.get("pitch")
                    }
                })

        # 4. Continuous Biometric Impersonation Monitoring (Periodic check every 12 frames)
        if len(detected_faces) == 1:
            self._frame_counters[attempt_id] = self._frame_counters.get(attempt_id, 0) + 1
            if self._frame_counters[attempt_id] % 12 == 0:
                users_col = get_users_col()
                user_doc = users_col.find_one({"_id": student_id}) or users_col.find_one({"_id": str(student_id)})
                if user_doc and user_doc.get("face_reference"):
                    ref_img = decode_base64_image(user_doc["face_reference"])
                    if ref_img is not None:
                        v_res = face_verifier.verify_faces(ref_img, frame)
                        if not v_res.get("verified", False):
                            triggered_events.append({
                                "type": EventTypeEnum.IMPERSONATION_DETECTED,
                                "confidence": round(float(1.0 - v_res.get("similarity", 0.0)), 2),
                                "metadata": {
                                    "similarity_percent": v_res.get("similarity_percent", 0.0),
                                    "threshold": v_res.get("threshold", 0.62),
                                    "note": "Impersonator detected: candidate face does not match registered student profile"
                                }
                            })

        # 5. Audio Activity Check
        if audio_energy is not None and audio_energy > 0:
            audio_res = audio_detector.analyze_energy(audio_energy)
            if audio_res.get("is_talking"):
                triggered_events.append({
                    "type": EventTypeEnum.AUDIO_ACTIVITY_DETECTED,
                    "confidence": 0.80,
                    "metadata": {"energy_level": audio_res.get("energy_level")}
                })

        # 5. Suspicion Scoring & Evidence Persistence
        current_score = attempt.get("suspicion_score", 0)
        events_col = get_events_col()
        saved_events = []

        for ev in triggered_events:
            ev_type = ev["type"]
            should_log, points = scoring_engine.should_log_event(attempt_id, ev_type)
            
            if should_log:
                current_score += points
                
                # Capture evidence screenshot for significant events (saving annotated or clean frame with metadata)
                evidence_path = save_evidence_image(frame, student_id, exam_id, ev_type)
                
                event_doc = {
                    "attempt_id": attempt_id,
                    "student_id": student_id,
                    "exam_id": exam_id,
                    "event_type": ev_type,
                    "timestamp": datetime.utcnow().isoformat(),
                    "confidence": ev.get("confidence", 1.0),
                    "suspicion_points": points,
                    "evidence_image": evidence_path,
                    "metadata": ev.get("metadata", {}),
                    "is_demo": False,
                    "status": "REVIEW"
                }
                events_col.insert_one(event_doc)
                saved_events.append(ev_type)

        # Update attempt score and risk level
        risk_level = scoring_engine.calculate_risk_level(current_score)
        attempts_col.update_one(
            {"_id": attempt_id},
            {
                "$set": {
                    "suspicion_score": current_score,
                    "risk_level": risk_level,
                    "last_active": datetime.utcnow().isoformat()
                },
                "$inc": {"total_events": len(saved_events)}
            }
        )

        # 6. Annotate and cache frame for admin monitoring
        frame_count = self._frame_counters.get(attempt_id, 0)
        should_update_preview = len(triggered_events) > 0 or frame_count % 4 == 0 or attempt_id not in self.live_feeds
        
        preview_image = self.live_feeds.get(attempt_id, {}).get("preview_image", "")
        if should_update_preview:
            annotated_frame = annotate_frame(
                frame,
                detections=detections,
                head_pose=head_pose_res,
                events=triggered_events,
                suspicion_score=current_score,
                debug_telemetry=phone_res.get("debug_telemetry")
            )
            preview_image = encode_image_to_base64(annotated_frame)
        
        # Cache live feed for admin monitoring
        self.live_feeds[attempt_id] = {
            "attempt_id": attempt_id,
            "student_name": attempt.get("student_name", "Student"),
            "student_code": attempt.get("student_code", "STU101"),
            "exam_title": attempt.get("exam_title", "Exam"),
            "suspicion_score": current_score,
            "risk_level": risk_level,
            "last_event": saved_events[-1] if saved_events else (triggered_events[0]["type"] if triggered_events else "NORMAL"),
            "phone_detected": phone_res.get("phone_detected", False),
            "phone_confidence": phone_res.get("max_confidence", 0.0),
            "timestamp": datetime.utcnow().isoformat(),
            "preview_image": preview_image
        }

        return {
            "status": "success",
            "suspicion_score": current_score,
            "risk_level": risk_level,
            "triggered_events": [e["type"] for e in triggered_events],
            "logged_events": saved_events,
            "person_count": presence_res.get("person_count", 0),
            "face_detected": len(detected_faces) > 0,
            "presence_status": status_presence,
            "head_pose": head_pose_res,
            "detections": detections,
            "detections_count": len(detections),
            "phone_status": "DETECTED" if (phone_res.get("phone_detected") or phone_res.get("phone_confirmed")) else "NOT_DETECTED",
            "phone_confirmed": phone_res.get("phone_confirmed", False),
            "phone_confidence": phone_res.get("max_confidence", 0.0),
            "phone_detections": phone_dets,
            "frame_size": [frame.shape[1], frame.shape[0]],
            "audio_energy": round(audio_energy, 4) if audio_energy else 0.0,
            "debug_telemetry": phone_res.get("debug_telemetry")
        }

    def log_direct_event(
        self,
        attempt_id: str,
        event_type: str,
        confidence: float = 1.0,
        evidence_image: Optional[str] = None,
        metadata: Optional[dict] = None,
        is_demo: bool = False
    ) -> Dict[str, Any]:
        """Manually or simulation-triggered proctoring event."""
        attempts_col = get_attempts_col()
        events_col = get_events_col()

        attempt = attempts_col.find_one({"_id": attempt_id})
        if not attempt:
            return {"error": "Attempt not found"}

        should_log, points = scoring_engine.should_log_event(attempt_id, event_type, force_log=is_demo)
        current_score = attempt.get("suspicion_score", 0) + points
        risk_level = scoring_engine.calculate_risk_level(current_score)

        event_doc = {
            "attempt_id": attempt_id,
            "student_id": attempt["student_id"],
            "exam_id": attempt["exam_id"],
            "event_type": event_type,
            "timestamp": datetime.utcnow().isoformat(),
            "confidence": confidence,
            "suspicion_points": points,
            "evidence_image": evidence_image or "/evidence/demo_placeholder.jpg",
            "metadata": metadata or {},
            "is_demo": is_demo,
            "status": "REVIEW"
        }
        events_col.insert_one(event_doc)

        attempts_col.update_one(
            {"_id": attempt_id},
            {
                "$set": {
                    "suspicion_score": current_score,
                    "risk_level": risk_level,
                    "last_active": datetime.utcnow().isoformat()
                },
                "$inc": {"total_events": 1}
            }
        )

        return {
            "event": event_type,
            "points_added": points,
            "new_suspicion_score": current_score,
            "risk_level": risk_level,
            "is_demo": is_demo
        }

proctoring_service = ProctoringService()
