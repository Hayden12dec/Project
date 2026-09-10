import pytest
from fastapi.testclient import TestClient
from backend.app import app

client = TestClient(app)

def test_student_exam_lifecycle():
    # 1. Login as student
    res_login = client.post("/api/auth/login", json={
        "email": "student@proctor.edu",
        "password": "Student@123"
    })
    token = res_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. List exams
    res_exams = client.get("/api/exams", headers=headers)
    assert res_exams.status_code == 200
    exams = res_exams.json()
    assert len(exams) >= 1
    exam_id = exams[0]["id"]

    # 3. Start Exam Attempt
    face_ref = res_login.json()["user"].get("face_reference")
    res_start = client.post("/api/attempts/start", json={
        "exam_id": exam_id,
        "verified_face_reference": face_ref
    }, headers=headers)
    assert res_start.status_code == 200
    data_start = res_start.json()
    attempt_id = data_start["attempt"]["id"]
    questions = data_start["exam"]["questions"]
    assert len(questions) >= 1

    # 4. Save answer to first question
    q1_id = questions[0]["id"]
    res_ans = client.post(f"/api/attempts/{attempt_id}/answer", json={
        "question_id": q1_id,
        "selected_option": 0,
        "mark_for_review": True
    }, headers=headers)
    assert res_ans.status_code == 200

    # 5. Submit Exam
    res_submit = client.post(f"/api/attempts/{attempt_id}/submit", json={"answers": {q1_id: 0}}, headers=headers)
    assert res_submit.status_code == 200
    res_data = res_submit.json()
    assert res_data["status"] == "submitted"
    assert "score" in res_data

def test_system_check_and_frame_api():
    res_login = client.post("/api/auth/login", json={
        "email": "student@proctor.edu",
        "password": "Student@123"
    })
    token = res_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Synthetic test image (640x480 gray frame with circle)
    import cv2, base64, numpy as np
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.circle(img, (320, 240), 80, (200, 200, 200), -1)
    _, buf = cv2.imencode(".jpg", img)
    b64_str = f"data:image/jpeg;base64,{base64.b64encode(buf).decode('utf-8')}"

    # Test /api/proctoring/system-check
    res_check = client.post("/api/proctoring/system-check", json={"image_base64": b64_str}, headers=headers)
    assert res_check.status_code == 200
    data = res_check.json()
    assert "camera_ready" in data
    assert "lighting_ok" in data
    assert "face_detected" in data
    assert "faces" in data
    assert isinstance(data["faces"], list)
