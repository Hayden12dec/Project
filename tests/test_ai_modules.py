import pytest
import numpy as np
import cv2
from backend.ai.face_detection import FaceDetector
from backend.ai.face_verification import FaceVerifier
from backend.ai.gaze_detection import GazeDetector
from backend.ai.person_detection import PersonPresenceDetector
from backend.ai.phone_detection import PhoneDetector
from backend.ai.audio_detection import AudioActivityDetector
from backend.ai.scoring_engine import SuspicionScoringEngine

def test_face_detector_initialization():
    detector = FaceDetector()
    # Test on blank synthetic image
    blank = np.zeros((480, 640, 3), dtype=np.uint8)
    faces = detector.detect_faces(blank)
    assert isinstance(faces, list)
    assert len(faces) == 0

def test_face_detector_synthetic_face():
    detector = FaceDetector()
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    # Draw simple skin-toned oval
    cv2.ellipse(img, (320, 240), (100, 140), 0, 0, 360, (180, 180, 220), -1)
    faces = detector.detect_faces(img)
    assert isinstance(faces, list)

def test_face_verification():
    verifier = FaceVerifier()
    img1 = np.ones((200, 200, 3), dtype=np.uint8) * 150
    img2 = np.ones((200, 200, 3), dtype=np.uint8) * 150
    res = verifier.verify_faces(img1, img2)
    assert "verified" in res
    assert "similarity" in res
    assert "similarity_percent" in res

def test_face_verification_missing_input():
    verifier = FaceVerifier()
    res = verifier.verify_faces(None, None)
    assert res["verified"] is False
    assert res["similarity"] == 0.0

def test_gaze_detection():
    detector = GazeDetector()
    blank = np.zeros((480, 640, 3), dtype=np.uint8)
    pose = detector.estimate_pose(blank)
    assert "direction" in pose
    assert "pitch" in pose
    assert "yaw" in pose

def test_gaze_direction_geometry_fallback(monkeypatch):
    """Test that candidate looking/moving to their right maps to LOOKING_RIGHT and left to LOOKING_LEFT."""
    detector = GazeDetector(yaw_threshold=20.0)
    # Disable MediaPipe to test geometric fallback deterministically
    detector.face_mesh = None

    # Candidate moved/turned to candidate's RIGHT (appears on image LEFT, x: 50..150, center: 100)
    img_right = np.zeros((480, 640, 3), dtype=np.uint8)
    from backend.ai import face_detection
    monkeypatch.setattr(
        face_detection.face_detector,
        "detect_faces",
        lambda img: [{"bbox": [50, 100, 150, 200], "confidence": 0.9}]
    )
    pose_right = detector.estimate_pose(img_right)
    assert pose_right["direction"] == "LOOKING_RIGHT"
    assert pose_right["yaw"] < -20.0
    assert pose_right["is_suspicious"] is True

    # Reset detector history
    detector._yaw_history.clear()
    detector._pitch_history.clear()

    # Candidate moved/turned to candidate's LEFT (appears on image RIGHT, x: 490..590, center: 540)
    img_left = np.zeros((480, 640, 3), dtype=np.uint8)
    monkeypatch.setattr(
        face_detection.face_detector,
        "detect_faces",
        lambda img: [{"bbox": [490, 100, 590, 200], "confidence": 0.9}]
    )
    pose_left = detector.estimate_pose(img_left)
    assert pose_left["direction"] == "LOOKING_LEFT"
    assert pose_left["yaw"] > 20.0
    assert pose_left["is_suspicious"] is True

def test_audio_detector():
    detector = AudioActivityDetector()
    res_silent = detector.analyze_energy(0.005)
    assert res_silent["is_talking"] is False

    # Simulate loud consecutive sound
    detector.analyze_energy(0.15)
    res_loud = detector.analyze_energy(0.18)
    assert res_loud["is_talking"] is True

def test_person_presence():
    detector = PersonPresenceDetector()
    blank = np.zeros((480, 640, 3), dtype=np.uint8)
    res = detector.analyze_presence(blank)
    assert res["person_count"] == 0
    assert res["is_absent"] is True
