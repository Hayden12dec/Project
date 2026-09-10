# pyrefly: ignore [missing-import]
import pytest
# pyrefly: ignore [missing-import]
from fastapi.testclient import TestClient
from backend.app import app
import base64
# pyrefly: ignore [missing-import]
import numpy as np
# pyrefly: ignore [missing-import]
import cv2

client = TestClient(app)

def test_full_system_flow(monkeypatch):
    from backend.routes import proctoring
    monkeypatch.setattr(proctoring.face_detector, "detect_faces", lambda img: [{"bbox": [200, 100, 440, 380], "confidence": 0.95, "landmarks": []}])

    print('\n--- 1. Login Student ---')
    res = client.post('/api/auth/login', json={'email': 'student@proctor.edu', 'password': 'Student@123'})
    assert res.status_code == 200, f'Login failed: {res.text}'
    token = res.json()['access_token']
    headers = {'Authorization': f'Bearer {token}'}

    print('\n--- 2. Fetch Exams ---')
    res = client.get('/api/exams', headers=headers)
    assert res.status_code == 200
    exams = res.json()
    assert len(exams) > 0
    exam_id = exams[0]['id']

    print('\n--- 3. System Check ---')
    frame = np.ones((480, 640, 3), dtype=np.uint8) * 180
    cv2.ellipse(frame, (320, 240), (90, 130), 0, 0, 360, (130, 160, 210), -1)
    _, buf = cv2.imencode('.jpg', frame)
    frame_b64 = 'data:image/jpeg;base64,' + base64.b64encode(buf).decode('utf-8')

    res = client.post('/api/proctoring/system-check', json={'image_base64': frame_b64}, headers=headers)
    assert res.status_code == 200
    assert res.json()['camera_ready'] is True

    print('\n--- 4. Update Face Reference ---')
    res = client.post('/api/proctoring/update-face-reference', json={'image_base64': frame_b64}, headers=headers)
    assert res.status_code == 200, f'Update face failed: {res.text}'
    assert res.json()['success'] is True

    print('\n--- 5. Verify Face ---')
    res = client.post('/api/proctoring/verify-face', json={'query_image': frame_b64}, headers=headers)
    assert res.status_code == 200

    print('\n--- 6. Start Exam Attempt ---')
    res = client.post('/api/attempts/start', json={'exam_id': exam_id, 'verified_face_reference': frame_b64}, headers=headers)
    assert res.status_code == 200
    attempt_id = res.json()['attempt']['id']

    print('\n--- 7. Live Frame Proctoring ---')
    res = client.post('/api/proctoring/frame', json={
        'attempt_id': attempt_id,
        'image_base64': frame_b64,
        'audio_energy': 0.05
    }, headers=headers)
    assert res.status_code == 200
    assert res.json()['status'] == 'success'

    print('\n--- 8. Simulate Violation ---')
    res = client.post('/api/demo/simulate', json={
        'attempt_id': attempt_id,
        'event_type': 'MOBILE_PHONE_DETECTED',
        'confidence': 0.95
    }, headers=headers)
    assert res.status_code == 200

    print('\n--- 9. Submit Exam ---')
    res = client.post(f'/api/attempts/{attempt_id}/submit', json={'answers': {}}, headers=headers)
    assert res.status_code == 200

    print('\n--- 10. Admin Dashboard & Reports ---')
    res_admin = client.post('/api/auth/login', json={'email': 'admin@proctor.edu', 'password': 'Admin@123'})
    assert res_admin.status_code == 200
    admin_token = res_admin.json()['access_token']
    admin_headers = {'Authorization': f'Bearer {admin_token}'}

    # Test Admin Dashboard
    res_dash = client.get('/api/admin/dashboard', headers=admin_headers)
    assert res_dash.status_code == 200
    assert 'metrics' in res_dash.json()

    # Test Admin Sessions
    res_sess = client.get('/api/admin/sessions', headers=admin_headers)
    assert res_sess.status_code == 200

    # Test Admin Attempt Report
    res_rep = client.get(f'/api/admin/reports/{attempt_id}', headers=admin_headers)
    assert res_rep.status_code == 200
    assert res_rep.json()['attempt_id'] == attempt_id
    print('\nALL 10 TESTS PASSED!')
