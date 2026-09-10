import os
from datetime import datetime, timedelta
from backend.config.db import (
    get_users_col,
    get_exams_col,
    get_questions_col,
    get_attempts_col,
    get_events_col
)
from backend.utils.security import hash_password
import logging

logger = logging.getLogger(__name__)

def seed_database():
    users_col = get_users_col()
    exams_col = get_exams_col()
    questions_col = get_questions_col()
    attempts_col = get_attempts_col()
    events_col = get_events_col()

    # 1. Seed Users if not present
    if users_col.count_documents({}) == 0:
        logger.info("Seeding default user accounts...")
        admin_user = {
            "name": "Dr. Sarah Jenkins (Chief Proctor)",
            "email": "admin@proctor.edu",
            "password_hash": hash_password("Admin@123"),
            "role": "admin",
            "student_id": "ADMIN001",
            "face_reference": None,
            "created_at": datetime.utcnow().isoformat()
        }
        users_col.insert_one(admin_user)

        student_user = {
            "name": "Alex Mitchell",
            "email": "student@proctor.edu",
            "password_hash": hash_password("Student@123"),
            "role": "student",
            "student_id": "STU202409",
            "face_reference": None,
            "created_at": datetime.utcnow().isoformat()
        }
        res_stu = users_col.insert_one(student_user)
        student_id_1 = str(res_stu.inserted_id)

        student_user_2 = {
            "name": "Emily Zhang",
            "email": "emily@proctor.edu",
            "password_hash": hash_password("Student@123"),
            "role": "student",
            "student_id": "STU202410",
            "face_reference": None,
            "created_at": datetime.utcnow().isoformat()
        }
        res_stu_2 = users_col.insert_one(student_user_2)
        student_id_2 = str(res_stu_2.inserted_id)
    else:
        stu = users_col.find_one({"email": "student@proctor.edu"})
        student_id_1 = str(stu["_id"]) if stu else "student1"
        stu2 = users_col.find_one({"email": "emily@proctor.edu"})
        student_id_2 = str(stu2["_id"]) if stu2 else "student2"

    # 2. Seed Exams if not present
    if exams_col.count_documents({}) == 0:
        logger.info("Seeding academic examination courses...")
        
        # Exam 1: AI & Machine Learning
        exam1 = {
            "title": "CS401: Artificial Intelligence & Machine Learning",
            "subject_code": "CS401",
            "description": "Final Term Assessment covering Computer Vision, Deep Learning architectures, Object Detection, and Model Evaluation metrics.",
            "duration_minutes": 30,
            "total_marks": 10,
            "passing_marks": 50,
            "created_by": "admin",
            "status": "active",
            "created_at": (datetime.utcnow() - timedelta(days=2)).isoformat()
        }
        res1 = exams_col.insert_one(exam1)
        exam1_id = str(res1.inserted_id)

        exam1_questions = [
            {
                "exam_id": exam1_id,
                "question_text": "Which computer vision architecture uses a single forward pass through a neural network to predict bounding boxes and class probabilities simultaneously?",
                "options": ["R-CNN", "Fast R-CNN", "YOLO (You Only Look Once)", "Sliding Window Classifier"],
                "correct_answer": 2,
                "marks": 1,
                "explanation": "YOLO reframes object detection as a single regression problem, straight from image pixels to bounding box coordinates and class probabilities."
            },
            {
                "exam_id": exam1_id,
                "question_text": "In head pose estimation, what are the three Euler rotation angles representing 3D orientation?",
                "options": ["Pitch, Yaw, Roll", "Latitude, Longitude, Altitude", "Azimuth, Zenith, Elevation", "Alpha, Beta, Gamma"],
                "correct_answer": 0,
                "marks": 1,
                "explanation": "Pitch (nodding up/down), Yaw (shaking head left/right), and Roll (tilting head sideways) form the 3D rigid body orientation."
            },
            {
                "exam_id": exam1_id,
                "question_text": "What is the primary purpose of Perspective-n-Point (solvePnP) algorithm in facial landmark processing?",
                "options": [
                    "Color space transformation from RGB to Grayscale",
                    "Estimating 3D camera pose relative to known 3D object points and 2D image projections",
                    "Applying Gaussian blur to reduce camera noise",
                    "Detecting edges in high resolution images"
                ],
                "correct_answer": 1,
                "marks": 1,
                "explanation": "cv2.solvePnP solves the problem of finding the pose of a calibrated camera given a set of n 3D points in the world and their corresponding 2D projections in the image."
            },
            {
                "exam_id": exam1_id,
                "question_text": "Which activation function is most commonly utilized in hidden layers of modern Convolutional Neural Networks to avoid vanishing gradients?",
                "options": ["Sigmoid", "ReLU (Rectified Linear Unit)", "Tanh", "Linear Identity"],
                "correct_answer": 1,
                "marks": 1,
                "explanation": "ReLU (f(x) = max(0, x)) preserves gradient flow during backpropagation and accelerates convergence."
            },
            {
                "exam_id": exam1_id,
                "question_text": "In biometrics, what distance metric is most frequently used to compare normalized face embeddings?",
                "options": ["Manhattan Distance", "Cosine Similarity / Cosine Distance", "Hamming Distance", "Chebyshev Distance"],
                "correct_answer": 1,
                "marks": 1,
                "explanation": "Cosine similarity measures the angle between normalized feature vectors, effectively capturing angular alignment in high-dimensional embedding space."
            },
            {
                "exam_id": exam1_id,
                "question_text": "Which metric balances Precision and Recall, calculated as their harmonic mean?",
                "options": ["Accuracy", "ROC-AUC", "F1-Score", "Mean Absolute Error (MAE)"],
                "correct_answer": 2,
                "marks": 1,
                "explanation": "F1-Score is the harmonic mean of precision and recall: 2 * (Precision * Recall) / (Precision + Recall)."
            },
            {
                "exam_id": exam1_id,
                "question_text": "What is the purpose of Non-Maximum Suppression (NMS) in object detection algorithms?",
                "options": [
                    "To eliminate redundant, overlapping bounding boxes for the same detected object",
                    "To normalize pixel brightness values across training images",
                    "To perform image compression before network input",
                    "To compute gradient descent step sizes"
                ],
                "correct_answer": 0,
                "marks": 1,
                "explanation": "NMS filters out redundant candidate boxes that overlap with the highest-confidence bounding box above an IoU threshold."
            },
            {
                "exam_id": exam1_id,
                "question_text": "In audio signal processing, what does RMS (Root Mean Square) energy quantify?",
                "options": ["Signal Frequency in Hz", "Signal Power / Loudness level", "Phase Shift in radians", "Sampling Rate"],
                "correct_answer": 1,
                "marks": 1,
                "explanation": "RMS energy measures the average power and amplitude of the audio signal over a given time window."
            },
            {
                "exam_id": exam1_id,
                "question_text": "Which loss function is standard for multi-class classification problems with one-hot encoded targets?",
                "options": ["Categorical Cross-Entropy", "Mean Squared Error", "Binary Cross-Entropy", "Hinge Loss"],
                "correct_answer": 0,
                "marks": 1,
                "explanation": "Categorical Cross-Entropy measures the performance of a classification model whose output is a probability distribution across multiple classes."
            },
            {
                "exam_id": exam1_id,
                "question_text": "What is the key advantage of transfer learning in deep learning applications?",
                "options": [
                    "Guarantees 100% test accuracy without fine-tuning",
                    "Leverages features learned on massive datasets to train on smaller domain datasets with faster convergence",
                    "Removes the need for GPU computation completely",
                    "Eliminates overfitting on all dataset types"
                ],
                "correct_answer": 1,
                "marks": 1,
                "explanation": "Transfer learning reuses feature extractors trained on large-scale datasets (like ImageNet/COCO), drastically reducing required training data and epochs."
            }
        ]
        for q in exam1_questions:
            questions_col.insert_one(q)

        # Exam 2: Computer Networks & Security
        exam2 = {
            "title": "CS402: Computer Networks & Cyber Defense",
            "subject_code": "CS402",
            "description": "Comprehensive evaluation of Network Protocols, Cryptographic Algorithms, Transport Layers, and Attack Vectors.",
            "duration_minutes": 25,
            "total_marks": 5,
            "passing_marks": 50,
            "created_by": "admin",
            "status": "active",
            "created_at": (datetime.utcnow() - timedelta(days=1)).isoformat()
        }
        res2 = exams_col.insert_one(exam2)
        exam2_id = str(res2.inserted_id)

        exam2_questions = [
            {
                "exam_id": exam2_id,
                "question_text": "Which OSI layer is responsible for end-to-end communication, flow control, and error recovery?",
                "options": ["Network Layer", "Transport Layer", "Data Link Layer", "Session Layer"],
                "correct_answer": 1,
                "marks": 1,
                "explanation": "The Transport Layer (Layer 4) provides transparent transfer of data between end systems with TCP flow/congestion control."
            },
            {
                "exam_id": exam2_id,
                "question_text": "In asymmetric cryptography (e.g., RSA), which key is used by the sender to encrypt a secret message intended exclusively for the recipient?",
                "options": ["Sender's Private Key", "Sender's Public Key", "Recipient's Public Key", "Shared Symmetric Key"],
                "correct_answer": 2,
                "marks": 1,
                "explanation": "The sender encrypts using the recipient's public key, ensuring only the recipient's private key can decrypt it."
            },
            {
                "exam_id": exam2_id,
                "question_text": "What protocol provides secure, encrypted communication over the World Wide Web using TLS?",
                "options": ["HTTP", "HTTPS", "FTP", "SNMP"],
                "correct_answer": 1,
                "marks": 1,
                "explanation": "HTTPS (Hypertext Transfer Protocol Secure) encrypts HTTP traffic using Transport Layer Security (TLS)."
            },
            {
                "exam_id": exam2_id,
                "question_text": "Which type of cyber attack involves flooding a target server with excessive bogus traffic to render it unavailable to legitimate users?",
                "options": ["SQL Injection", "Distributed Denial of Service (DDoS)", "Cross-Site Scripting (XSS)", "Man-in-the-Middle (MITM)"],
                "correct_answer": 1,
                "marks": 1,
                "explanation": "A DDoS attack overwhelms system resources and bandwidth using a coordinated botnet."
            },
            {
                "exam_id": exam2_id,
                "question_text": "What is the standard subnet mask for a Class C IPv4 network with 24 network bits (/24)?",
                "options": ["255.0.0.0", "255.255.0.0", "255.255.255.0", "255.255.255.255"],
                "correct_answer": 2,
                "marks": 1,
                "explanation": "A /24 prefix corresponds to 24 consecutive '1' bits, yielding the subnet mask 255.255.255.0."
            }
        ]
        for q in exam2_questions:
            questions_col.insert_one(q)

        # 3. Seed an evaluated sample attempt for Dr. Sarah Jenkins' dashboard demonstration
        sample_attempt = {
            "student_id": student_id_2,
            "student_name": "Emily Zhang",
            "student_code": "STU202410",
            "exam_id": exam1_id,
            "exam_title": "CS401: Artificial Intelligence & Machine Learning",
            "duration_minutes": 30,
            "answers": {},
            "score": 8.0,
            "max_score": 10.0,
            "percentage": 80.0,
            "passed": True,
            "correct_count": 8,
            "total_questions": 10,
            "started_at": (datetime.utcnow() - timedelta(hours=3)).isoformat(),
            "submitted_at": (datetime.utcnow() - timedelta(hours=2, minutes=35)).isoformat(),
            "status": "submitted",
            "suspicion_score": 10,
            "risk_level": "LOW",
            "total_events": 1
        }
        res_att = attempts_col.insert_one(sample_attempt)
        sample_att_id = str(res_att.inserted_id)

        sample_event = {
            "attempt_id": sample_att_id,
            "student_id": student_id_2,
            "exam_id": exam1_id,
            "event_type": "SUSPICIOUS_HEAD_MOVEMENT",
            "timestamp": (datetime.utcnow() - timedelta(hours=2, minutes=45)).isoformat(),
            "confidence": 0.88,
            "suspicion_points": 10,
            "evidence_image": "/evidence/demo_sample_gaze.jpg",
            "metadata": {"direction": "LOOKING_RIGHT", "yaw": 28.4},
            "is_demo": False,
            "status": "REVIEW"
        }
        events_col.insert_one(sample_event)
        logger.info("Database seeding completed successfully.")

if __name__ == "__main__":
    seed_database()
