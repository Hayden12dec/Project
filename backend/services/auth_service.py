from datetime import datetime
from typing import Dict, Any, Optional
from fastapi import HTTPException, status
from backend.config.db import get_users_col
from backend.models.entities import UserEntity, RoleEnum
from backend.models.schemas import RegisterRequest, LoginRequest, UserProfileUpdateRequest
from backend.utils.security import hash_password, verify_password, create_access_token
import logging

logger = logging.getLogger(__name__)

class AuthService:
    def register_user(self, req: RegisterRequest) -> Dict[str, Any]:
        users_col = get_users_col()
        existing = users_col.find_one({"email": req.email.lower()})
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this email already exists"
            )

        role = req.role.lower() if req.role in [RoleEnum.STUDENT, RoleEnum.ADMIN] else RoleEnum.STUDENT
        subject = req.subject.strip() if req.subject else ("All Subjects" if role == RoleEnum.ADMIN else None)
        
        user_doc = {
            "name": req.name.strip(),
            "email": req.email.lower().strip(),
            "password_hash": hash_password(req.password),
            "role": role,
            "subject": subject,
            "student_id": req.student_id or f"STU{int(datetime.utcnow().timestamp()) % 100000:05d}",
            "face_reference": req.face_reference,
            "created_at": datetime.utcnow().isoformat()
        }

        res = users_col.insert_one(user_doc)
        user_doc["_id"] = str(res.inserted_id)
        
        # Issue JWT
        token = create_access_token({
            "sub": user_doc["_id"],
            "email": user_doc["email"],
            "role": user_doc["role"],
            "subject": user_doc.get("subject"),
            "name": user_doc["name"]
        })

        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": user_doc["_id"],
                "name": user_doc["name"],
                "email": user_doc["email"],
                "role": user_doc["role"],
                "subject": user_doc.get("subject"),
                "student_id": user_doc["student_id"],
                "has_face_reference": bool(user_doc.get("face_reference")),
                "face_reference": user_doc.get("face_reference")
            }
        }

    def login_user(self, req: LoginRequest) -> Dict[str, Any]:
        users_col = get_users_col()
        user = users_col.find_one({"email": req.email.lower().strip()})
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        if not verify_password(req.password, user.get("password_hash", "")):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        user_subject = user.get("subject") or ("All Subjects" if user.get("role") == "admin" else None)

        token = create_access_token({
            "sub": str(user["_id"]),
            "email": user["email"],
            "role": user["role"],
            "subject": user_subject,
            "name": user["name"]
        })

        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": str(user["_id"]),
                "name": user["name"],
                "email": user["email"],
                "role": user["role"],
                "subject": user_subject,
                "student_id": user.get("student_id"),
                "has_face_reference": bool(user.get("face_reference")),
                "face_reference": user.get("face_reference")
            }
        }

    def update_user_profile(self, user_id: str, req: UserProfileUpdateRequest) -> Dict[str, Any]:
        users_col = get_users_col()
        user = users_col.find_one({"_id": user_id}) or users_col.find_one({"_id": str(user_id)})
        if not user:
            user = users_col.find_one({"email": user_id.lower().strip()}) or users_col.find_one({"student_id": user_id})
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User account not found"
            )

        target_id = str(user["_id"])
        updates: Dict[str, Any] = {}

        # 1. Update Name (supported for both student and admin)
        if req.name is not None:
            clean_name = req.name.strip()
            if not clean_name:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Name cannot be empty"
                )
            updates["name"] = clean_name

        # 2. Update Student ID (for student role)
        if req.student_id is not None and user.get("role") == RoleEnum.STUDENT:
            clean_student_id = req.student_id.strip()
            if clean_student_id:
                updates["student_id"] = clean_student_id

        # 3. Update Subject Domain (for admin role)
        if req.subject is not None and user.get("role") == RoleEnum.ADMIN:
            clean_subject = req.subject.strip() or "All Subjects"
            updates["subject"] = clean_subject

        # 4. Update or clear Face Reference
        if req.face_reference is not None:
            if req.face_reference == "" or req.face_reference.lower() == "remove":
                updates["face_reference"] = None
            else:
                updates["face_reference"] = req.face_reference

        # 5. Update Password if requested
        if req.new_password:
            clean_new_pass = req.new_password.strip()
            if len(clean_new_pass) < 4:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="New password must be at least 4 characters long"
                )
            # Require current password validation
            if not req.current_password or not verify_password(req.current_password, user.get("password_hash", "")):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Current password is required and must match your existing password"
                )
            updates["password_hash"] = hash_password(clean_new_pass)

        # Apply updates to database if any
        if updates:
            users_col.update_one({"_id": target_id}, {"$set": updates})
            try:
                users_col.update_one({"_id": user["_id"]}, {"$set": updates})
            except Exception:
                pass

            # Sync student name across exam attempts for data consistency
            if "name" in updates:
                from backend.config.db import get_attempts_col
                attempts_col = get_attempts_col()
                attempts_col.update_one(
                    {"student_id": target_id},
                    {"$set": {"student_name": updates["name"]}}
                )

        # Fetch fresh updated document
        updated_user = users_col.find_one({"_id": target_id}) or users_col.find_one({"_id": user["_id"]}) or {**user, **updates}
        user_subject = updated_user.get("subject") or ("All Subjects" if updated_user.get("role") == "admin" else None)

        # Generate renewed JWT token with latest claims
        token = create_access_token({
            "sub": str(updated_user["_id"]),
            "email": updated_user["email"],
            "role": updated_user["role"],
            "subject": user_subject,
            "name": updated_user["name"]
        })

        return {
            "access_token": token,
            "token_type": "bearer",
            "message": "Profile updated successfully",
            "user": {
                "id": str(updated_user["_id"]),
                "name": updated_user["name"],
                "email": updated_user["email"],
                "role": updated_user["role"],
                "subject": user_subject,
                "student_id": updated_user.get("student_id"),
                "has_face_reference": bool(updated_user.get("face_reference")),
                "face_reference": updated_user.get("face_reference")
            }
        }

    def delete_user_account(self, user_id: str) -> Dict[str, Any]:
        users_col = get_users_col()
        from backend.config.db import get_attempts_col, get_events_col
        from backend.services.proctoring_service import proctoring_service

        user = users_col.find_one({"_id": user_id}) or users_col.find_one({"_id": str(user_id)})
        if not user:
            user = users_col.find_one({"email": user_id.lower().strip()}) or users_col.find_one({"student_id": user_id})
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User account not found"
            )

        target_id = str(user["_id"])
        
        # 1. Remove user document
        users_col.delete_one({"_id": target_id})
        try:
            users_col.delete_one({"_id": user["_id"]})
        except Exception:
            pass

        # 2. Clean up associated attempts, events, and live feeds
        attempts_col = get_attempts_col()
        events_col = get_events_col()

        attempts = list(attempts_col.find({"student_id": target_id}))
        attempt_ids = [str(a["_id"]) for a in attempts]
        
        if user.get("email"):
            attempts_email = list(attempts_col.find({"student_email": user["email"]}))
            for a in attempts_email:
                attempt_ids.append(str(a["_id"]))

        for a_id in set(attempt_ids):
            events_col.delete_many({"attempt_id": a_id})
            proctoring_service.live_feeds.pop(a_id, None)

        attempts_col.delete_many({"student_id": target_id})
        if user.get("email"):
            attempts_col.delete_many({"student_email": user["email"]})

        return {
            "success": True,
            "message": f"Account for '{user.get('name')}' ({user.get('email')}) and all related exam records have been permanently deleted."
        }

auth_service = AuthService()
