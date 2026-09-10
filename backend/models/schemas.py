from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

# Auth Schemas
class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str = "student"
    student_id: Optional[str] = None
    face_reference: Optional[str] = None
    subject: Optional[str] = None

class LoginRequest(BaseModel):
    email: str
    password: str

class AdminRegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    invite_code: str
    subject: Optional[str] = "All Subjects"

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]

class UserProfileResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    student_id: Optional[str] = None
    subject: Optional[str] = None
    has_face_reference: bool = False
    face_reference: Optional[str] = None

class UserProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    student_id: Optional[str] = None
    subject: Optional[str] = None
    face_reference: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None

class UserProfileUpdateResponse(BaseModel):
    access_token: Optional[str] = None
    token_type: str = "bearer"
    user: Dict[str, Any]
    message: str = "Profile updated successfully"

# Exam Schemas
class QuestionCreate(BaseModel):
    question_text: str
    options: List[str]
    correct_answer: int
    marks: int = 1
    explanation: Optional[str] = None

class QuestionResponse(BaseModel):
    id: str
    exam_id: str
    question_text: str
    options: List[str]
    marks: int = 1
    # Note: correct_answer is excluded during student exams

class ExamCreate(BaseModel):
    title: str
    subject_code: str
    category: Optional[str] = None
    description: str
    duration_minutes: int
    total_marks: int = 100
    passing_marks: int = 40
    questions: Optional[List[QuestionCreate]] = []

class ExamUpdate(BaseModel):
    title: Optional[str] = None
    subject_code: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    duration_minutes: Optional[int] = None
    passing_marks: Optional[int] = None
    status: Optional[str] = None

# Attempt Schemas
class StartExamRequest(BaseModel):
    exam_id: str
    verified_face_reference: Optional[str] = None

class SaveAnswerRequest(BaseModel):
    question_id: str
    selected_option: Optional[int] = None
    mark_for_review: Optional[bool] = None

class SubmitExamRequest(BaseModel):
    answers: Optional[Dict[str, int]] = None

# Proctoring Schemas
class FrameAnalysisRequest(BaseModel):
    attempt_id: str
    image_base64: str
    audio_energy: Optional[float] = 0.0

class DirectEventLogRequest(BaseModel):
    attempt_id: str
    event_type: str
    confidence: Optional[float] = 1.0
    evidence_image: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    is_demo: bool = False

class DemoSimulateRequest(BaseModel):
    attempt_id: str
    event_type: str
    confidence: Optional[float] = 0.95
