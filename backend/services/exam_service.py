from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import HTTPException, status
from backend.config.db import get_exams_col, get_questions_col, get_attempts_col, get_users_col
from backend.models.schemas import ExamCreate, ExamUpdate, StartExamRequest, SaveAnswerRequest, SubmitExamRequest
import logging

logger = logging.getLogger(__name__)

class ExamService:
    def list_exams(
        self,
        user_role: str = "student",
        created_by: Optional[str] = None,
        subject: Optional[str] = None,
        user_subject: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        exams_col = get_exams_col()
        users_col = get_users_col()
        query = {"status": "active"} if user_role == "student" else {}
        if created_by:
            query["created_by"] = created_by
            
        if subject and subject.strip().lower() not in ["all", "all subjects"]:
            clean_sub = subject.strip()
            query["$or"] = [
                {"subject_code": {"$regex": f"{clean_sub}", "$options": "i"}},
                {"category": {"$regex": f"{clean_sub}", "$options": "i"}}
            ]
        elif user_role == "admin" and user_subject and user_subject.strip().lower() not in ["all subjects", "all", ""]:
            # Admin with specific assigned subject domain (e.g. DBMS)
            clean_sub = user_subject.strip()
            query["$or"] = [
                {"created_by": user_id},
                {"subject_code": {"$regex": f"{clean_sub}", "$options": "i"}},
                {"category": {"$regex": f"{clean_sub}", "$options": "i"}},
                {"title": {"$regex": f"{clean_sub}", "$options": "i"}}
            ]
        exams = list(exams_col.find(query).sort("created_at", -1))
        
        # Populate question counts and creator info
        questions_col = get_questions_col()
        creator_cache = {}
        for ex in exams:
            ex["id"] = str(ex["_id"])
            ex["questions_count"] = questions_col.count_documents({"exam_id": ex["id"]})
            
            # Populate category fallback
            if not ex.get("category"):
                ex["category"] = ex.get("subject_code", "General")
                
            # Populate creator info
            c_id = ex.get("created_by")
            if c_id:
                if c_id not in creator_cache:
                    u = users_col.find_one({"_id": c_id}) or users_col.find_one({"email": c_id})
                    if u:
                        creator_cache[c_id] = {
                            "name": u.get("name", "Administrator"),
                            "email": u.get("email", "")
                        }
                    else:
                        creator_cache[c_id] = {
                            "name": "Chief Proctor Admin",
                            "email": "admin@proctor.edu"
                        }
                ex["creator_name"] = creator_cache[c_id]["name"]
                ex["creator_email"] = creator_cache[c_id]["email"]
            else:
                ex["creator_name"] = "Chief Proctor Admin"
                ex["creator_email"] = "admin@proctor.edu"
                
        return exams

    def get_exam_details(self, exam_id: str, is_admin: bool = False) -> Dict[str, Any]:
        exams_col = get_exams_col()
        users_col = get_users_col()
        exam = exams_col.find_one({"_id": exam_id})
        if not exam:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
        
        exam["id"] = str(exam["_id"])
        if not exam.get("category"):
            exam["category"] = exam.get("subject_code", "General")

        c_id = exam.get("created_by")
        if c_id:
            u = users_col.find_one({"_id": c_id}) or users_col.find_one({"email": c_id})
            if u:
                exam["creator_name"] = u.get("name", "Administrator")
                exam["creator_email"] = u.get("email", "")
            else:
                exam["creator_name"] = "Chief Proctor Admin"
                exam["creator_email"] = "admin@proctor.edu"
        else:
            exam["creator_name"] = "Chief Proctor Admin"
            exam["creator_email"] = "admin@proctor.edu"
        
        # Fetch questions
        questions_col = get_questions_col()
        questions = list(questions_col.find({"exam_id": exam_id}))
        
        sanitized_questions = []
        for q in questions:
            q_dict = {
                "id": str(q["_id"]),
                "exam_id": q["exam_id"],
                "question_text": q["question_text"],
                "options": q["options"],
                "marks": q.get("marks", 1)
            }
            if is_admin:
                q_dict["correct_answer"] = q.get("correct_answer")
                q_dict["explanation"] = q.get("explanation")
            sanitized_questions.append(q_dict)
            
        exam["questions"] = sanitized_questions
        exam["questions_count"] = len(sanitized_questions)
        return exam

    def create_exam(self, req: ExamCreate, user_id: str) -> Dict[str, Any]:
        exams_col = get_exams_col()
        questions_col = get_questions_col()
        
        category = (req.category or req.subject_code or "General").strip()
        
        exam_doc = {
            "title": req.title.strip(),
            "subject_code": req.subject_code.strip().upper(),
            "category": category,
            "description": req.description.strip(),
            "duration_minutes": req.duration_minutes,
            "total_marks": req.total_marks,
            "passing_marks": req.passing_marks,
            "created_by": user_id,
            "status": "active",
            "created_at": datetime.utcnow().isoformat()
        }
        
        res = exams_col.insert_one(exam_doc)
        exam_id = str(res.inserted_id)
        exam_doc["id"] = exam_id
        
        # Insert initial questions if provided
        if req.questions:
            for q in req.questions:
                q_doc = {
                    "exam_id": exam_id,
                    "question_text": q.question_text,
                    "options": q.options,
                    "correct_answer": q.correct_answer,
                    "marks": q.marks,
                    "explanation": q.explanation,
                    "created_at": datetime.utcnow().isoformat()
                }
                questions_col.insert_one(q_doc)
                
        return self.get_exam_details(exam_id, is_admin=True)

    def update_exam(self, exam_id: str, req: ExamUpdate) -> Dict[str, Any]:
        exams_col = get_exams_col()
        exam = exams_col.find_one({"_id": exam_id})
        if not exam:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
            
        updates = {k: v for k, v in req.dict().items() if v is not None}
        if updates:
            if "subject_code" in updates and updates["subject_code"]:
                updates["subject_code"] = updates["subject_code"].strip().upper()
            if "category" in updates and updates["category"]:
                updates["category"] = updates["category"].strip()
            exams_col.update_one({"_id": exam_id}, {"$set": updates})
            
        return self.get_exam_details(exam_id, is_admin=True)

    def delete_exam(self, exam_id: str):
        exams_col = get_exams_col()
        questions_col = get_questions_col()
        exams_col.delete_one({"_id": exam_id})
        questions_col.delete_many({"exam_id": exam_id})
        return {"message": "Exam deleted successfully"}

    def add_question(self, exam_id: str, q_data: dict) -> dict:
        questions_col = get_questions_col()
        q_doc = {
            "exam_id": exam_id,
            "question_text": q_data["question_text"],
            "options": q_data["options"],
            "correct_answer": int(q_data["correct_answer"]),
            "marks": int(q_data.get("marks", 1)),
            "explanation": q_data.get("explanation", ""),
            "created_at": datetime.utcnow().isoformat()
        }
        res = questions_col.insert_one(q_doc)
        q_doc["id"] = str(res.inserted_id)
        return q_doc

    def delete_question(self, question_id: str):
        questions_col = get_questions_col()
        questions_col.delete_one({"_id": question_id})
        return {"message": "Question deleted successfully"}

    # Attempt Operations
    def start_exam_attempt(self, user: dict, exam_id: str, verified_face: Optional[str] = None) -> Dict[str, Any]:
        from backend.ai import face_verifier, face_detector
        from backend.utils.image_utils import decode_base64_image

        attempts_col = get_attempts_col()
        exams_col = get_exams_col()
        users_col = get_users_col()
        
        exam = exams_col.find_one({"_id": exam_id})
        if not exam:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

        # Fetch latest user record to verify enrolled facial baseline
        user_doc = users_col.find_one({"_id": user.get("_id")}) or users_col.find_one({"_id": str(user.get("_id"))}) or user
        enrolled_face = user_doc.get("face_reference")

        # Strict Server-Side Biometric Identity Verification
        if enrolled_face:
            if not verified_face:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Live camera verification snapshot is required before starting this examination."
                )

            ref_img = decode_base64_image(enrolled_face)
            query_img = decode_base64_image(verified_face)

            if ref_img is None or query_img is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Failed to decode biometric face images for verification."
                )

            v_res = face_verifier.verify_faces(ref_img, query_img)
            if not v_res.get("verified", False) and v_res.get("similarity", 0.0) < 0.48:
                pct = v_res.get("similarity_percent", 0.0)
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Biometric Identity Verification Failed ({pct}% match). The candidate face in front of the camera does not match the enrolled student profile."
                )
        elif verified_face:
            # If student has no reference yet, validate single face and save initial reference
            query_img = decode_base64_image(verified_face)
            if query_img is not None:
                faces = face_detector.detect_faces(query_img)
                if len(faces) == 1:
                    users_col.update_one({"_id": str(user["_id"])}, {"$set": {"face_reference": verified_face}})

        # Check for active in-progress attempt
        existing_attempt = attempts_col.find_one({
            "student_id": str(user["_id"]),
            "exam_id": exam_id,
            "status": "in_progress"
        })
        
        if existing_attempt:
            existing_attempt["id"] = str(existing_attempt["_id"])
            return {
                "attempt": existing_attempt,
                "exam": self.get_exam_details(exam_id, is_admin=False)
            }

        # Create new attempt
        attempt_doc = {
            "student_id": str(user["_id"]),
            "student_name": user["name"],
            "student_code": user.get("student_id", "STU101"),
            "exam_id": exam_id,
            "exam_title": exam["title"],
            "duration_minutes": exam["duration_minutes"],
            "answers": {},
            "marked_for_review": [],
            "score": 0.0,
            "max_score": 0.0,
            "started_at": datetime.utcnow().isoformat(),
            "submitted_at": None,
            "status": "in_progress",
            "suspicion_score": 0,
            "risk_level": "LOW",
            "total_events": 0
        }

        res = attempts_col.insert_one(attempt_doc)
        attempt_doc["id"] = str(res.inserted_id)

        return {
            "attempt": attempt_doc,
            "exam": self.get_exam_details(exam_id, is_admin=False)
        }

    def save_answer(self, attempt_id: str, user_id: str, req: SaveAnswerRequest) -> Dict[str, Any]:
        attempts_col = get_attempts_col()
        attempt = attempts_col.find_one({"_id": attempt_id, "student_id": user_id})
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

        if attempt.get("status") != "in_progress":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot edit a submitted attempt")

        answers = attempt.get("answers", {})
        marked = attempt.get("marked_for_review", [])

        if req.selected_option is not None:
            answers[req.question_id] = req.selected_option
        
        if req.mark_for_review is not None:
            if req.mark_for_review and req.question_id not in marked:
                marked.append(req.question_id)
            elif not req.mark_for_review and req.question_id in marked:
                marked.remove(req.question_id)

        attempts_col.update_one(
            {"_id": attempt_id},
            {"$set": {"answers": answers, "marked_for_review": marked}}
        )

        return {"status": "saved", "answers_count": len(answers)}

    def submit_exam_attempt(self, attempt_id: str, user_id: str, req: Optional[SubmitExamRequest] = None) -> Dict[str, Any]:
        attempts_col = get_attempts_col()
        questions_col = get_questions_col()
        exams_col = get_exams_col()

        attempt = attempts_col.find_one({"_id": attempt_id, "student_id": user_id})
        if not attempt:
            attempt = attempts_col.find_one({"_id": attempt_id})
            if not attempt:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

        if attempt.get("status") in ["submitted", "evaluated"]:
            return self.get_attempt_result(attempt_id, user_id)

        answers = attempt.get("answers", {})
        if req and req.answers:
            answers.update(req.answers)

        # Grade the exam
        exam_id = attempt["exam_id"]
        exam = exams_col.find_one({"_id": exam_id})
        questions = list(questions_col.find({"exam_id": exam_id}))

        total_score = 0.0
        max_score = 0.0
        correct_count = 0

        for q in questions:
            q_id = str(q["_id"])
            q_marks = q.get("marks", 1)
            max_score += q_marks
            correct_ans = q.get("correct_answer")
            student_ans = answers.get(q_id)
            
            if student_ans is not None:
                try:
                    if int(student_ans) == int(correct_ans):
                        total_score += q_marks
                        correct_count += 1
                except (ValueError, TypeError):
                    if str(student_ans).strip() == str(correct_ans).strip():
                        total_score += q_marks
                        correct_count += 1

        percentage = round((total_score / max_score * 100) if max_score > 0 else 0.0, 2)
        passing_marks = exam.get("passing_marks", 40) if exam else 40
        passed = percentage >= passing_marks

        submitted_at = datetime.utcnow().isoformat()

        attempts_col.update_one(
            {"_id": attempt_id},
            {
                "$set": {
                    "answers": answers,
                    "score": total_score,
                    "max_score": max_score,
                    "percentage": percentage,
                    "passed": passed,
                    "correct_count": correct_count,
                    "total_questions": len(questions),
                    "submitted_at": submitted_at,
                    "status": "submitted"
                }
            }
        )

        return self.get_attempt_result(attempt_id, user_id)

    def get_attempt_result(self, attempt_id: str, user_id: Optional[str] = None) -> Dict[str, Any]:
        attempts_col = get_attempts_col()
        query = {"_id": attempt_id}
        if user_id:
            query["student_id"] = user_id
            
        attempt = attempts_col.find_one(query)
        if not attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

        attempt["id"] = str(attempt["_id"])
        return attempt

exam_service = ExamService()
