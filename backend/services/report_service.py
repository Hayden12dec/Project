from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import HTTPException, status
from backend.config.db import get_attempts_col, get_events_col, get_exams_col, get_users_col, get_questions_col
from backend.ai.scoring_engine import scoring_engine
import logging

logger = logging.getLogger(__name__)

class ReportService:
    def generate_attempt_report(self, attempt_id: str) -> Dict[str, Any]:
        attempts_col = get_attempts_col()
        attempt = attempts_col.find_one({"_id": attempt_id})
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

        student_id = attempt["student_id"]
        exam_id = attempt["exam_id"]

        users_col = get_users_col()
        student = users_col.find_one({"_id": student_id}) or {}

        exams_col = get_exams_col()
        exam = exams_col.find_one({"_id": exam_id}) or {}

        questions_col = get_questions_col()
        total_questions_count = questions_col.count_documents({"exam_id": exam_id})

        # Fetch proctoring events
        events_col = get_events_col()
        events = list(events_col.find({"attempt_id": attempt_id}).sort("timestamp", 1))

        # Event breakdown counts
        event_breakdown = {}
        high_risk_events_count = 0
        evidence_gallery = []

        for ev in events:
            ev["id"] = str(ev["_id"])
            ev_type = ev.get("event_type", "UNKNOWN")
            event_breakdown[ev_type] = event_breakdown.get(ev_type, 0) + 1

            if ev_type in ["MOBILE_PHONE_DETECTED", "MULTIPLE_PERSONS_DETECTED", "STUDENT_ABSENT"]:
                high_risk_events_count += 1

            if ev.get("evidence_image"):
                evidence_gallery.append({
                    "event_id": ev["id"],
                    "event_type": ev_type,
                    "timestamp": ev.get("timestamp"),
                    "points": ev.get("suspicion_points", 0),
                    "confidence": ev.get("confidence", 1.0),
                    "image_url": ev.get("evidence_image"),
                    "is_demo": ev.get("is_demo", False),
                    "status": ev.get("status", "REVIEW")
                })

        answers = attempt.get("answers", {})
        attempted_count = len(answers)
        unanswered_count = max(0, total_questions_count - attempted_count)

        suspicion_score = attempt.get("suspicion_score", 0)
        risk_level = scoring_engine.calculate_risk_level(suspicion_score)
        final_status = scoring_engine.calculate_final_status(suspicion_score, high_risk_events_count)

        report = {
            "attempt_id": str(attempt["_id"]),
            "student_info": {
                "student_id": student.get("student_id", attempt.get("student_code", "STU101")),
                "name": student.get("name", attempt.get("student_name", "Student")),
                "email": student.get("email", ""),
                "face_reference": student.get("face_reference")
            },
            "exam_info": {
                "exam_id": exam_id,
                "title": exam.get("title", attempt.get("exam_title", "Exam")),
                "subject_code": exam.get("subject_code", ""),
                "duration_minutes": exam.get("duration_minutes", 60),
                "started_at": attempt.get("started_at"),
                "submitted_at": attempt.get("submitted_at"),
                "total_questions": total_questions_count,
                "attempted_questions": attempted_count,
                "unanswered_questions": unanswered_count,
                "score_obtained": attempt.get("score", 0.0),
                "max_score": attempt.get("max_score", total_questions_count),
                "percentage": attempt.get("percentage", 0.0),
                "passed": attempt.get("passed", False),
                "status": attempt.get("status", "in_progress")
            },
            "proctoring_summary": {
                "suspicion_score": suspicion_score,
                "risk_level": risk_level,
                "final_status": final_status,
                "total_events": len(events),
                "high_risk_events": high_risk_events_count,
                "event_breakdown": event_breakdown,
                "evidence_gallery": evidence_gallery,
                "events_timeline": events
            },
            "disclaimer": "AI suspicion scores and flagged anomalies are indicative signals designed for proctor review assistance and do not constitute automated disciplinary proof."
        }

        return report

report_service = ReportService()
