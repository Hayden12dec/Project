from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime

class RoleEnum(str):
    STUDENT = "student"
    ADMIN = "admin"

class EventTypeEnum(str):
    FACE_NOT_DETECTED = "FACE_NOT_DETECTED"
    MULTIPLE_PERSONS_DETECTED = "MULTIPLE_PERSONS_DETECTED"
    SUSPICIOUS_HEAD_MOVEMENT = "SUSPICIOUS_HEAD_MOVEMENT"
    MOBILE_PHONE_DETECTED = "MOBILE_PHONE_DETECTED"
    STUDENT_ABSENT = "STUDENT_ABSENT"
    AUDIO_ACTIVITY_DETECTED = "AUDIO_ACTIVITY_DETECTED"
    TAB_SWITCH_DETECTED = "TAB_SWITCH_DETECTED"
    IMPERSONATION_DETECTED = "IMPERSONATION_DETECTED"
    LOOKING_LEFT = "LOOKING_LEFT"
    LOOKING_RIGHT = "LOOKING_RIGHT"
    LOOKING_UP = "LOOKING_UP"
    LOOKING_DOWN = "LOOKING_DOWN"

class RiskLevelEnum(str):
    LOW = "LOW"          # 0-29
    MEDIUM = "MEDIUM"    # 30-59
    HIGH = "HIGH"        # 60+

class UserEntity(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    name: str
    email: str
    password_hash: str
    role: str = RoleEnum.STUDENT
    student_id: Optional[str] = None
    subject: Optional[str] = None # For admins: assigned subject domain e.g. "DBMS", "Computer Networks", "All Subjects"
    face_reference: Optional[str] = None # Base64 reference image
    created_at: Optional[str] = None

class QuestionEntity(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    exam_id: str
    question_text: str
    options: List[str] # 4 options
    correct_answer: int # 0-3 index
    marks: int = 1
    explanation: Optional[str] = None

class ExamEntity(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    title: str
    subject_code: str
    category: Optional[str] = None
    description: str
    duration_minutes: int
    total_marks: int = 100
    passing_marks: int = 40
    questions_count: int = 0
    created_by: str
    created_at: Optional[str] = None
    status: str = "active" # active, draft, archived

class ExamAttemptEntity(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    student_id: str
    student_name: str
    exam_id: str
    exam_title: str
    answers: Dict[str, int] = {} # question_id -> selected_option_index
    marked_for_review: List[str] = [] # question_ids
    score: Optional[float] = None
    max_score: Optional[float] = None
    percentage: Optional[float] = None
    passed: Optional[bool] = None
    started_at: str
    submitted_at: Optional[str] = None
    status: str = "in_progress" # in_progress, submitted, evaluated, timed_out
    suspicion_score: int = 0
    risk_level: str = RiskLevelEnum.LOW
    total_events: int = 0

class ProctoringEventEntity(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    attempt_id: str
    student_id: str
    exam_id: str
    event_type: str
    timestamp: str
    confidence: float = 1.0
    suspicion_points: int = 0
    evidence_image: Optional[str] = None
    metadata: Dict[str, Any] = {}
    is_demo: bool = False
    status: str = "REVIEW" # REVIEW, RESOLVED, DISMISSED
