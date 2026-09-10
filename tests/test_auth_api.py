import pytest
from fastapi.testclient import TestClient
from backend.app import app

client = TestClient(app)

def test_health_endpoint():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert "scoring_weights" in data

def test_admin_and_student_login():
    # Test Admin Login
    res_admin = client.post("/api/auth/login", json={
        "email": "admin@proctor.edu",
        "password": "Admin@123"
    })
    assert res_admin.status_code == 200
    data_admin = res_admin.json()
    assert "access_token" in data_admin
    assert data_admin["user"]["role"] == "admin"

    # Test Student Login
    res_stu = client.post("/api/auth/login", json={
        "email": "student@proctor.edu",
        "password": "Student@123"
    })
    assert res_stu.status_code == 200
    data_stu = res_stu.json()
    assert "access_token" in data_stu
    assert data_stu["user"]["role"] == "student"

def test_invalid_login():
    res = client.post("/api/auth/login", json={
        "email": "wrong@proctor.edu",
        "password": "WrongPassword!"
    })
    assert res.status_code == 401

def test_update_profile_student_and_admin():
    # Login as student
    login_res = client.post("/api/auth/login", json={
        "email": "student@proctor.edu",
        "password": "Student@123"
    })
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Update student name
    update_res = client.put("/api/auth/me", json={
        "name": "Alex Updated Candidate",
        "student_id": "STU-NEW-88"
    }, headers=headers)
    assert update_res.status_code == 200
    user_data = update_res.json()["user"]
    assert user_data["name"] == "Alex Updated Candidate"
    assert user_data["student_id"] == "STU-NEW-88"

    # Verify via /api/auth/me
    me_res = client.get("/api/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["name"] == "Alex Updated Candidate"

    # Login as admin
    admin_login = client.post("/api/auth/login", json={
        "email": "admin@proctor.edu",
        "password": "Admin@123"
    })
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Update admin name
    admin_update = client.put("/api/auth/me", json={
        "name": "Prof. Charles Xavier",
        "subject": "AI & Machine Learning"
    }, headers=admin_headers)
    assert admin_update.status_code == 200
    adm_user = admin_update.json()["user"]
    assert adm_user["name"] == "Prof. Charles Xavier"
    assert adm_user["subject"] == "AI & Machine Learning"
