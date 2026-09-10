# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict, Any, Optional
from backend.models.schemas import ExamCreate, ExamUpdate, QuestionCreate
from backend.services.exam_service import exam_service
from backend.utils.security import get_current_user, get_current_admin

router = APIRouter(prefix="/exams", tags=["Exams"])

@router.get("")
def list_exams(
    created_by: Optional[str] = None,
    subject: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    return exam_service.list_exams(
        user_role=current_user.get("role", "student"),
        created_by=created_by,
        subject=subject,
        user_subject=current_user.get("subject"),
        user_id=str(current_user["_id"])
    )

@router.get("/{exam_id}")
def get_exam(exam_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    is_admin = current_user.get("role") == "admin"
    return exam_service.get_exam_details(exam_id, is_admin=is_admin)

@router.post("", status_code=status.HTTP_201_CREATED)
def create_exam(req: ExamCreate, current_admin: Dict[str, Any] = Depends(get_current_admin)):
    return exam_service.create_exam(req, user_id=str(current_admin["_id"]))

@router.put("/{exam_id}")
def update_exam(exam_id: str, req: ExamUpdate, current_admin: Dict[str, Any] = Depends(get_current_admin)):
    return exam_service.update_exam(exam_id, req)

@router.delete("/{exam_id}")
def delete_exam(exam_id: str, current_admin: Dict[str, Any] = Depends(get_current_admin)):
    return exam_service.delete_exam(exam_id)

@router.post("/{exam_id}/questions", status_code=status.HTTP_201_CREATED)
def add_question(exam_id: str, req: QuestionCreate, current_admin: Dict[str, Any] = Depends(get_current_admin)):
    return exam_service.add_question(exam_id, req.dict())

@router.delete("/questions/{question_id}")
def delete_question(question_id: str, current_admin: Dict[str, Any] = Depends(get_current_admin)):
    return exam_service.delete_question(question_id)
