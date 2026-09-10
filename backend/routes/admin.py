from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any, List
from backend.config.db import get_users_col, get_exams_col, get_attempts_col, get_events_col
from backend.services.report_service import report_service
from backend.services.auth_service import auth_service
from backend.services.proctoring_service import proctoring_service
from backend.utils.security import get_current_admin, get_current_user
from backend.models.entities import RiskLevelEnum

router = APIRouter(prefix="/admin", tags=["Admin Dashboard & Live Proctoring"])

@router.get("/dashboard")
def get_dashboard_stats(current_admin: Dict[str, Any] = Depends(get_current_admin)):
    users_col = get_users_col()
    exams_col = get_exams_col()
    attempts_col = get_attempts_col()
    events_col = get_events_col()

    admin_subject = current_admin.get("subject")
    admin_id = str(current_admin["_id"])
    is_scoped_admin = bool(admin_subject and admin_subject.strip().lower() not in ["all subjects", "all", ""])

    if is_scoped_admin:
        clean_sub = admin_subject.strip()
        exam_query = {
            "$or": [
                {"created_by": admin_id},
                {"subject_code": {"$regex": f"{clean_sub}", "$options": "i"}},
                {"category": {"$regex": f"{clean_sub}", "$options": "i"}},
                {"title": {"$regex": f"{clean_sub}", "$options": "i"}}
            ]
        }
        admin_exams = list(exams_col.find(exam_query))
        admin_exam_ids = [str(e["_id"]) for e in admin_exams]
        
        total_exams = len(admin_exams)
        active_exams = sum(1 for e in admin_exams if e.get("status") == "active")
        all_attempts = [a for a in attempts_col.find({}) if a.get("exam_id") in admin_exam_ids or clean_sub.lower() in a.get("exam_title", "").lower()]
        relevant_attempt_ids = [str(a["_id"]) for a in all_attempts]
        all_events = [e for e in events_col.find({}) if e.get("attempt_id") in relevant_attempt_ids]
    else:
        total_exams = exams_col.count_documents({})
        active_exams = exams_col.count_documents({"status": "active"})
        all_attempts = list(attempts_col.find({}))
        all_events = list(events_col.find({}))

    total_students = users_col.count_documents({"role": "student"})
    active_sessions = sum(1 for a in all_attempts if a.get("status") == "in_progress")
    completed_exams = sum(1 for a in all_attempts if a.get("status") in ["submitted", "evaluated"])
    
    suspicious_sessions = sum(1 for a in all_attempts if a.get("suspicion_score", 0) >= 30)
    high_risk_sessions = sum(1 for a in all_attempts if a.get("suspicion_score", 0) >= 60)

    # Event Breakdown by Type
    events_by_type = {}
    for e in all_events:
        t = e.get("event_type", "OTHER")
        events_by_type[t] = events_by_type.get(t, 0) + 1

    # Suspicion score distribution
    score_distribution = {
        "LOW (0-29)": sum(1 for a in all_attempts if a.get("suspicion_score", 0) < 30),
        "MEDIUM (30-59)": sum(1 for a in all_attempts if 30 <= a.get("suspicion_score", 0) < 60),
        "HIGH (60+)": sum(1 for a in all_attempts if a.get("suspicion_score", 0) >= 60)
    }

    # Recent attempts list
    recent_attempts = sorted(all_attempts, key=lambda x: str(x.get("started_at", "")), reverse=True)[:10]
    for a in recent_attempts:
        a["id"] = str(a["_id"])

    return {
        "admin_subject": admin_subject or "All Subjects",
        "is_scoped": is_scoped_admin,
        "metrics": {
            "total_students": total_students,
            "total_exams": total_exams,
            "active_exams": active_exams,
            "active_sessions": active_sessions,
            "completed_exams": completed_exams,
            "suspicious_sessions": suspicious_sessions,
            "high_risk_sessions": high_risk_sessions,
            "total_incidents_logged": len(all_events)
        },
        "charts": {
            "events_by_type": events_by_type,
            "score_distribution": score_distribution
        },
        "recent_attempts": recent_attempts
    }

@router.get("/sessions")
def get_active_sessions(current_admin: Dict[str, Any] = Depends(get_current_admin)):
    attempts_col = get_attempts_col()
    exams_col = get_exams_col()
    admin_subject = current_admin.get("subject")
    admin_id = str(current_admin["_id"])
    is_scoped_admin = bool(admin_subject and admin_subject.strip().lower() not in ["all subjects", "all", ""])

    if is_scoped_admin:
        clean_sub = admin_subject.strip()
        exam_query = {
            "$or": [
                {"created_by": admin_id},
                {"subject_code": {"$regex": f"{clean_sub}", "$options": "i"}},
                {"category": {"$regex": f"{clean_sub}", "$options": "i"}},
                {"title": {"$regex": f"{clean_sub}", "$options": "i"}}
            ]
        }
        admin_exams = list(exams_col.find(exam_query))
        admin_exam_ids = [str(e["_id"]) for e in admin_exams]
        sessions = [
            s for s in attempts_col.find({"status": "in_progress"}).sort("started_at", -1)
            if s.get("exam_id") in admin_exam_ids or clean_sub.lower() in s.get("exam_title", "").lower()
        ]
    else:
        sessions = list(attempts_col.find({"status": "in_progress"}).sort("started_at", -1))
    
    enriched_sessions = []
    for s in sessions:
        att_id = str(s["_id"])
        s["id"] = att_id
        live_feed = proctoring_service.live_feeds.get(att_id)
        if live_feed:
            s["live_preview"] = live_feed.get("preview_image")
            s["latest_event"] = live_feed.get("last_event")
        enriched_sessions.append(s)
        
    return enriched_sessions

@router.get("/reports/{attempt_id}")
def get_attempt_report(attempt_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        attempts_col = get_attempts_col()
        attempt = attempts_col.find_one({"_id": attempt_id}) or attempts_col.find_one({"_id": str(attempt_id)})
        if not attempt or attempt.get("student_id") != str(current_user.get("_id")):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this report")
    return report_service.generate_attempt_report(attempt_id)

@router.get("/students")
def list_students(current_admin: Dict[str, Any] = Depends(get_current_admin)):
    users_col = get_users_col()
    attempts_col = get_attempts_col()
    students = list(users_col.find({"role": "student"}).sort("created_at", -1))
    
    result = []
    for st in students:
        s_id = str(st["_id"])
        attempts_count = attempts_col.count_documents({"student_id": s_id})
        result.append({
            "id": s_id,
            "name": st.get("name"),
            "email": st.get("email"),
            "student_id": st.get("student_id"),
            "has_face_reference": bool(st.get("face_reference")),
            "attempts_count": attempts_count,
            "created_at": st.get("created_at")
        })
    return result

@router.delete("/students/{student_id}")
def delete_student_by_admin(student_id: str, current_admin: Dict[str, Any] = Depends(get_current_admin)):
    """Deletes a student account and all their examination attempts & audit data."""
    return auth_service.delete_user_account(student_id)


@router.delete("/attempts/clear")
def clear_all_attempts(current_admin: Dict[str, Any] = Depends(get_current_admin)):
    """Deletes all student examination sessions, proctoring events, and live feeds."""
    attempts_col = get_attempts_col()
    events_col = get_events_col()
    
    del_att = attempts_col.delete_many({})
    del_ev = events_col.delete_many({})
    proctoring_service.live_feeds.clear()
    
    return {
        "success": True,
        "message": f"Cleared {del_att.deleted_count} examination session(s) and {del_ev.deleted_count} proctoring event(s)."
    }

@router.delete("/attempts/{attempt_id}")
def delete_single_attempt(attempt_id: str, current_admin: Dict[str, Any] = Depends(get_current_admin)):
    """Deletes a specific examination attempt and its events."""
    attempts_col = get_attempts_col()
    events_col = get_events_col()
    
    res = attempts_col.delete_one({"_id": attempt_id})
    events_col.delete_many({"attempt_id": attempt_id})
    proctoring_service.live_feeds.pop(attempt_id, None)
    
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Attempt not found")
        
    return {"success": True, "message": "Examination session deleted successfully."}
