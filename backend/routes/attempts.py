from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any, Optional
from backend.models.schemas import StartExamRequest, SaveAnswerRequest, SubmitExamRequest
from backend.services.exam_service import exam_service
from backend.utils.security import get_current_user
from backend.config.db import get_attempts_col

router = APIRouter(prefix="/attempts", tags=["Exam Attempts"])

@router.get("/my")
def get_my_attempts(current_user: Dict[str, Any] = Depends(get_current_user)):
    attempts_col = get_attempts_col()
    attempts = list(attempts_col.find({"student_id": str(current_user["_id"])}).sort("started_at", -1))
    for a in attempts:
        a["id"] = str(a["_id"])
    return attempts

@router.post("/start")
def start_exam(req: StartExamRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    return exam_service.start_exam_attempt(
        user=current_user,
        exam_id=req.exam_id,
        verified_face=req.verified_face_reference
    )

@router.post("/{attempt_id}/answer")
def save_answer(attempt_id: str, req: SaveAnswerRequest, current_user: Dict[str, Any] = Depends(get_current_user)):
    return exam_service.save_answer(
        attempt_id=attempt_id,
        user_id=str(current_user["_id"]),
        req=req
    )

@router.post("/{attempt_id}/submit")
def submit_exam(attempt_id: str, req: Optional[SubmitExamRequest] = None, current_user: Dict[str, Any] = Depends(get_current_user)):
    return exam_service.submit_exam_attempt(
        attempt_id=attempt_id,
        user_id=str(current_user["_id"]),
        req=req
    )

@router.get("/{attempt_id}/result")
def get_attempt_result(attempt_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    user_id = None if current_user.get("role") == "admin" else str(current_user["_id"])
    return exam_service.get_attempt_result(attempt_id, user_id=user_id)

@router.get("/{attempt_id}/report")
def get_attempt_report(attempt_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    from backend.services.report_service import report_service
    if current_user.get("role") != "admin":
        attempts_col = get_attempts_col()
        attempt = attempts_col.find_one({"_id": attempt_id}) or attempts_col.find_one({"_id": str(attempt_id)})
        if not attempt or attempt.get("student_id") != str(current_user.get("_id")):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this report")
    return report_service.generate_attempt_report(attempt_id)
