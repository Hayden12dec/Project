import os
from typing import List
from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv()

class Settings(BaseModel):
    PROJECT_NAME: str = "AI-Based Smart Examination Proctoring System"
    VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"
    
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", 8000))
    DEBUG: bool = os.getenv("DEBUG", "True").lower() in ("true", "1")
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "*"
    ]
    
    # Database
    MONGODB_URI: str = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    DATABASE_NAME: str = os.getenv("DATABASE_NAME", "smart_proctor_db")
    
    # Security
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "smart_proctoring_super_secret_jwt_key_2026_change_in_production")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 480))
    
    # Suspicion Scoring Weights
    WEIGHT_FACE_NOT_DETECTED: int = int(os.getenv("WEIGHT_FACE_NOT_DETECTED", 20))
    WEIGHT_MULTIPLE_PERSONS: int = int(os.getenv("WEIGHT_MULTIPLE_PERSONS", 40))
    WEIGHT_MOBILE_PHONE: int = int(os.getenv("WEIGHT_MOBILE_PHONE", 50))
    WEIGHT_SUSPICIOUS_HEAD_MOVEMENT: int = int(os.getenv("WEIGHT_SUSPICIOUS_HEAD_MOVEMENT", 10))
    WEIGHT_AUDIO_ACTIVITY: int = int(os.getenv("WEIGHT_AUDIO_ACTIVITY", 20))
    WEIGHT_STUDENT_ABSENT: int = int(os.getenv("WEIGHT_STUDENT_ABSENT", 30))
    
    # Thresholds
    HEAD_POSE_YAW_THRESHOLD: float = float(os.getenv("HEAD_POSE_YAW_THRESHOLD", 20.0))
    HEAD_POSE_PITCH_THRESHOLD: float = float(os.getenv("HEAD_POSE_PITCH_THRESHOLD", 16.0))
    PHONE_CONFIDENCE_THRESHOLD: float = float(os.getenv("PHONE_CONFIDENCE_THRESHOLD", 0.22))
    PHONE_DETECTION_DEBUG: bool = os.getenv("PHONE_DETECTION_DEBUG", "True").lower() in ("true", "1")
    PHONE_TEMPORAL_FRAMES: int = int(os.getenv("PHONE_TEMPORAL_FRAMES", 1))
    PHONE_TEMPORAL_WINDOW_SECONDS: float = float(os.getenv("PHONE_TEMPORAL_WINDOW_SECONDS", 0.5))
    AUDIO_ENERGY_THRESHOLD: float = float(os.getenv("AUDIO_ENERGY_THRESHOLD", 0.03))
    EVIDENCE_COOLDOWN_SECONDS: float = float(os.getenv("EVIDENCE_COOLDOWN_SECONDS", 5.0))
    ABSENCE_TIMEOUT_SECONDS: float = float(os.getenv("ABSENCE_TIMEOUT_SECONDS", 8.0))
    
    # Paths
    EVIDENCE_DIR: str = os.getenv("EVIDENCE_DIR", "./evidence")
    MODELS_DIR: str = os.getenv("MODELS_DIR", "./models/weights")
    YOLO_MODEL_PATH: str = os.getenv("YOLO_MODEL_PATH", "yolov8n.pt")
    
    # Demo/Test Mode
    DEMO_MODE_ENABLED: bool = os.getenv("DEMO_MODE_ENABLED", "True").lower() in ("true", "1")

    # Admin Registration
    ADMIN_INVITE_CODE: str = os.getenv("ADMIN_INVITE_CODE", "PROCTOR-ADMIN-2026")

    class Config:
        case_sensitive = True

settings = Settings()

# Ensure directories exist
os.makedirs(settings.EVIDENCE_DIR, exist_ok=True)
os.makedirs(settings.MODELS_DIR, exist_ok=True)
