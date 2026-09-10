import numpy as np
import logging
from backend.ai.face_detection import face_detector

logger = logging.getLogger(__name__)

class PersonPresenceDetector:
    """
    Evaluates candidate presence and multiple-person presence.
    Uses temporal confirmation to avoid false alarms.
    """
    def __init__(self, absence_threshold_frames=5, multiple_threshold_frames=2):
        self.absence_threshold_frames = absence_threshold_frames
        self.multiple_threshold_frames = multiple_threshold_frames
        self.consecutive_missing_frames = 0
        self.consecutive_multiple_frames = 0

    def analyze_presence(self, image: np.ndarray) -> dict:
        """
        Analyzes image for single person, multiple persons, or missing person.
        Returns:
            {
                "person_count": int,
                "is_absent": bool,
                "is_multiple": bool,
                "status": "NORMAL" | "FACE_NOT_DETECTED" | "MULTIPLE_PERSONS_DETECTED" | "STUDENT_ABSENT",
                "faces": list
            }
        """
        if image is None:
            self.consecutive_missing_frames += 1
            self.consecutive_multiple_frames = 0
            return {
                "person_count": 0,
                "is_absent": True,
                "is_multiple": False,
                "status": "STUDENT_ABSENT" if self.consecutive_missing_frames >= self.absence_threshold_frames else "FACE_NOT_DETECTED",
                "faces": []
            }

        faces = face_detector.detect_faces(image)
        person_count = len(faces)

        if person_count == 0:
            self.consecutive_missing_frames += 1
            self.consecutive_multiple_frames = 0
            is_absent = self.consecutive_missing_frames >= self.absence_threshold_frames
            return {
                "person_count": 0,
                "is_absent": True,
                "is_multiple": False,
                "status": "STUDENT_ABSENT" if is_absent else "FACE_NOT_DETECTED",
                "faces": []
            }
        
        # Person detected: reset absence counter
        self.consecutive_missing_frames = 0

        if person_count > 1:
            self.consecutive_multiple_frames += 1
            is_confirmed_multiple = self.consecutive_multiple_frames >= self.multiple_threshold_frames
            
            # Color secondary faces red for proctor alert
            for i, f in enumerate(faces):
                if i > 0 or is_confirmed_multiple:
                    f["color"] = (0, 0, 255) # Red
                    f["label"] = f"Person #{i+1}"
                else:
                    f["color"] = (0, 255, 0) # Green
                    f["label"] = "Candidate"
                    
            return {
                "person_count": person_count,
                "is_absent": False,
                "is_multiple": is_confirmed_multiple,
                "status": "MULTIPLE_PERSONS_DETECTED" if is_confirmed_multiple else "NORMAL",
                "faces": faces
            }

        # Exactly 1 person detected
        self.consecutive_multiple_frames = max(0, self.consecutive_multiple_frames - 1)
        if faces:
            faces[0]["color"] = (0, 255, 0)
            faces[0]["label"] = "Candidate"

        return {
            "person_count": 1,
            "is_absent": False,
            "is_multiple": False,
            "status": "NORMAL",
            "faces": faces
        }

person_detector = PersonPresenceDetector()
