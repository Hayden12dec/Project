import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from backend.config.settings import settings
from backend.utils.logger import setup_logging, logger
from backend.seed_data import seed_database
from backend.routes import auth, exams, attempts, proctoring, admin, demo

setup_logging()

# Initial database seed on load
try:
    seed_database()
except Exception as e:
    logger.error(f"Initial seed notice: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing Smart Proctoring Backend Engine via Lifespan...")
    try:
        seed_database()
    except Exception as e:
        logger.error(f"Lifespan seeding notice: {e}")
    yield
    logger.info("Smart Proctoring Backend Engine shutdown.")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="AI-Based Smart Examination Proctoring System REST API",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Evidence Directory for static image retrieval
os.makedirs(settings.EVIDENCE_DIR, exist_ok=True)
app.mount("/evidence", StaticFiles(directory=settings.EVIDENCE_DIR), name="evidence")

# Include API Routers
app.include_router(auth.router, prefix=settings.API_PREFIX)
app.include_router(exams.router, prefix=settings.API_PREFIX)
app.include_router(attempts.router, prefix=settings.API_PREFIX)
app.include_router(proctoring.router, prefix=settings.API_PREFIX)
app.include_router(admin.router, prefix=settings.API_PREFIX)
app.include_router(demo.router, prefix=settings.API_PREFIX)

@app.get("/")
def root():
    return {
        "status": "online",
        "system": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "api_docs": "/docs"
    }

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "demo_mode": settings.DEMO_MODE_ENABLED,
        "scoring_weights": {
            "FACE_NOT_DETECTED": settings.WEIGHT_FACE_NOT_DETECTED,
            "MULTIPLE_PERSONS": settings.WEIGHT_MULTIPLE_PERSONS,
            "MOBILE_PHONE": settings.WEIGHT_MOBILE_PHONE,
            "SUSPICIOUS_HEAD_MOVEMENT": settings.WEIGHT_SUSPICIOUS_HEAD_MOVEMENT,
            "AUDIO_ACTIVITY": settings.WEIGHT_AUDIO_ACTIVITY,
            "STUDENT_ABSENT": settings.WEIGHT_STUDENT_ABSENT
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
