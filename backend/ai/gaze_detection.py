# pyrefly: ignore [missing-import]
import cv2
# pyrefly: ignore [missing-import]
import numpy as np
import logging
import collections
from backend.config.settings import settings

logger = logging.getLogger(__name__)

class GazeDetector:
    """
    High-Precision 3D Head Pose & Eye Gaze Estimator.
    Combines:
    1. MediaPipe 468/478 refined 3D FaceMesh landmark geometry.
    2. OpenCV Perspective-n-Point (solvePnP) iterative 3D rigid pose estimation.
    3. Biocular iris center displacement tracking for sub-degree gaze direction.
    4. Adaptive dual-rate temporal filtering for zero-lag, jitter-free orientation.
    """
    def __init__(
        self,
        yaw_threshold=settings.HEAD_POSE_YAW_THRESHOLD,
        pitch_threshold=settings.HEAD_POSE_PITCH_THRESHOLD
    ):
        self.yaw_threshold = yaw_threshold
        self.pitch_threshold = pitch_threshold
        self.mp_face_mesh = None
        self.face_mesh = None

        # Temporal smoothing buffers
        self._yaw_history = collections.deque(maxlen=4)
        self._pitch_history = collections.deque(maxlen=4)
        self._roll_history = collections.deque(maxlen=4)
        self._consecutive_suspicious = 0
        self._suspicious_threshold = 1

        self._init_facemesh()

        # Calibrated 3D Anthropometric Facial Model Points (in mm)
        # Coordinates in Camera Space: [X (Image Right+), Y (Image Down+), Z (Away+)]
        self.model_points = np.array([
            (0.0, 0.0, 0.0),             # Nose tip (Landmark 1)
            (0.0, 110.0, -65.0),         # Chin (Landmark 152)
            (65.0, -45.0, -30.0),        # Candidate Left eye (Image Right, Landmark 263)
            (-65.0, -45.0, -30.0),       # Candidate Right eye (Image Left, Landmark 33)
            (40.0, 55.0, -30.0),         # Candidate Left mouth (Image Right, Landmark 291)
            (-40.0, 55.0, -30.0),        # Candidate Right mouth (Image Left, Landmark 61)
            (0.0, -95.0, -25.0)          # Glabella / Forehead (Landmark 10)
        ], dtype=np.float64)

    def _init_facemesh(self):
        try:
            # pyrefly: ignore [missing-import]
            import mediapipe as mp
            self.mp_face_mesh = mp.solutions.face_mesh
            self.face_mesh = self.mp_face_mesh.FaceMesh(
                max_num_faces=1,
                refine_landmarks=True,
                min_detection_confidence=0.25,
                min_tracking_confidence=0.25
            )
            logger.info("MediaPipe FaceMesh initialized successfully for 3D Head Pose & Gaze Estimation.")
        except Exception as e:
            logger.warning(f"MediaPipe FaceMesh fallback notice: {e}")

    def _compute_iris_gaze_offset(self, landmarks, w, h):
        """Computes iris center gaze deviation relative to eye canthi (normalized -1.0 to 1.0)."""
        if len(landmarks) < 478:
            return 0.0, 0.0

        try:
            # Candidate Left eye (Image Right): outer=263, inner=362, iris=468
            l_outer = np.array([landmarks[263].x * w, landmarks[263].y * h])
            l_inner = np.array([landmarks[362].x * w, landmarks[362].y * h])
            l_iris = np.array([landmarks[468].x * w, landmarks[468].y * h])

            # Candidate Right eye (Image Left): outer=33, inner=133, iris=473
            r_outer = np.array([landmarks[33].x * w, landmarks[33].y * h])
            r_inner = np.array([landmarks[133].x * w, landmarks[133].y * h])
            r_iris = np.array([landmarks[473].x * w, landmarks[473].y * h])

            # Horizontal eye width
            l_width = max(1.0, np.linalg.norm(l_outer - l_inner))
            r_width = max(1.0, np.linalg.norm(r_outer - r_inner))

            # Iris center relative to mid-eye
            l_mid = (l_outer + l_inner) / 2.0
            r_mid = (r_outer + r_inner) / 2.0

            # Displacement along horizontal axis
            l_dx = (l_iris[0] - l_mid[0]) / (l_width * 0.5)
            r_dx = (r_iris[0] - r_mid[0]) / (r_width * 0.5)

            # Looking to candidate's left -> irises shift to image right (dx > 0)
            avg_dx = float((l_dx + r_dx) / 2.0)
            
            # Gaze angle adjustment in degrees (positive when looking left, negative when looking right)
            iris_yaw_deg = float(avg_dx * 20.0)
            return iris_yaw_deg, avg_dx
        except Exception as e:
            logger.debug(f"Iris gaze offset note: {e}")
            return 0.0, 0.0

    def estimate_pose(self, image: np.ndarray, raw_landmarks: np.ndarray = None) -> dict:
        """
        Estimates 3D Head Pose and Eye Gaze direction.
        Accepts optional raw_landmarks from face_detection to bypass duplicate inference.
        """
        if image is None or image.size == 0:
            return {
                "detected": False,
                "pitch": 0.0,
                "yaw": 0.0,
                "roll": 0.0,
                "direction": "FORWARD",
                "is_suspicious": False,
                "confidence": 0.0
            }

        h, w, _ = image.shape
        
        # 1. High-Speed 3D SolvePnP & Iris Gaze Tracking
        pts = raw_landmarks
        landmarks_obj = None

        if pts is None and self.face_mesh is not None:
            try:
                rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                results = self.face_mesh.process(rgb_image)
                if results.multi_face_landmarks and len(results.multi_face_landmarks) > 0:
                    landmarks_obj = results.multi_face_landmarks[0].landmark
                    pts = np.array([[lm.x * w, lm.y * h, lm.z * w] for lm in landmarks_obj], dtype=np.float32)
            except Exception as e:
                logger.debug(f"MediaPipe FaceMesh inference notice: {e}")

        image_points = None
        iris_offset_yaw = 0.0

        if isinstance(pts, dict):
            try:
                # Keypoints dictionary passed from face detection
                def _get_pt(k):
                    return pts.get(str(k)) or pts.get(int(k))

                p1 = _get_pt(1)
                p152 = _get_pt(152)
                p263 = _get_pt(263)
                p33 = _get_pt(33)
                p291 = _get_pt(291)
                p61 = _get_pt(61)
                p10 = _get_pt(10)

                if all(p is not None for p in [p1, p152, p263, p33, p291, p61, p10]):
                    image_points = np.array([
                        (p1[0], p1[1]),
                        (p152[0], p152[1]),
                        (p263[0], p263[1]),
                        (p33[0], p33[1]),
                        (p291[0], p291[1]),
                        (p61[0], p61[1]),
                        (p10[0], p10[1])
                    ], dtype=np.float64)

                iris_data = pts.get("iris")
                if iris_data and isinstance(iris_data, dict):
                    l_out = np.array(iris_data["l_outer"][:2], dtype=np.float64)
                    l_in = np.array(iris_data["l_inner"][:2], dtype=np.float64)
                    l_ir = np.array(iris_data["l_iris"][:2], dtype=np.float64)
                    r_out = np.array(iris_data["r_outer"][:2], dtype=np.float64)
                    r_in = np.array(iris_data["r_inner"][:2], dtype=np.float64)
                    r_ir = np.array(iris_data["r_iris"][:2], dtype=np.float64)

                    l_w = max(1.0, float(np.linalg.norm(l_out - l_in)))
                    r_w = max(1.0, float(np.linalg.norm(r_out - r_in)))
                    l_m = (l_out + l_in) / 2.0
                    r_m = (r_out + r_in) / 2.0
                    l_dx = (l_ir[0] - l_m[0]) / (l_w * 0.5)
                    r_dx = (r_ir[0] - r_m[0]) / (r_w * 0.5)
                    iris_offset_yaw = float(((l_dx + r_dx) / 2.0) * 7.0)
            except Exception as e:
                logger.debug(f"Dict keypoint pose parse note: {e}")

        elif pts is not None and len(pts) >= 468:
            try:
                # 2D Image Coordinates of Key Anchors
                image_points = np.array([
                    (pts[1][0], pts[1][1]),       # Nose tip
                    (pts[152][0], pts[152][1]),   # Chin
                    (pts[263][0], pts[263][1]),   # Candidate Left eye (Image Right)
                    (pts[33][0], pts[33][1]),     # Candidate Right eye (Image Left)
                    (pts[291][0], pts[291][1]),   # Candidate Left mouth (Image Right)
                    (pts[61][0], pts[61][1]),     # Candidate Right mouth (Image Left)
                    (pts[10][0], pts[10][1])      # Forehead
                ], dtype=np.float64)

                if len(pts) >= 478:
                    l_outer = pts[263][:2]
                    l_inner = pts[362][:2]
                    l_iris = pts[468][:2]
                    r_outer = pts[33][:2]
                    r_inner = pts[133][:2]
                    r_iris = pts[473][:2]

                    l_width = max(1.0, float(np.linalg.norm(l_outer - l_inner)))
                    r_width = max(1.0, float(np.linalg.norm(r_outer - r_inner)))
                    l_mid = (l_outer + l_inner) / 2.0
                    r_mid = (r_outer + r_inner) / 2.0

                    l_dx = (l_iris[0] - l_mid[0]) / (l_width * 0.5)
                    r_dx = (r_iris[0] - r_mid[0]) / (r_width * 0.5)
                    iris_offset_yaw = float(((l_dx + r_dx) / 2.0) * 7.0)
            except Exception as e:
                logger.debug(f"Array landmark pose parse note: {e}")

        if image_points is not None:
            try:
                # Camera intrinsic parameters
                focal_length = w
                center = (w / 2.0, h / 2.0)
                camera_matrix = np.array([
                    [focal_length, 0, center[0]],
                    [0, focal_length, center[1]],
                    [0, 0, 1]
                ], dtype=np.float64)
                dist_coeffs = np.zeros((4, 1), dtype=np.float64)

                # Solve Perspective-n-Point
                success, rvec, tvec = cv2.solvePnP(
                    self.model_points,
                    image_points,
                    camera_matrix,
                    dist_coeffs,
                    flags=cv2.SOLVEPNP_ITERATIVE
                )

                if success:
                    rmat, _ = cv2.Rodrigues(rvec)
                    angles, _, _, _, _, _ = cv2.RQDecomp3x3(rmat)

                    raw_pitch = float(angles[0])
                    raw_yaw = float(angles[1]) + iris_offset_yaw
                    raw_roll = float(angles[2])

                    # Adaptive Instant-Response EMA
                    last_yaw = self._yaw_history[-1] if self._yaw_history else raw_yaw
                    last_pitch = self._pitch_history[-1] if self._pitch_history else raw_pitch
                    last_roll = self._roll_history[-1] if self._roll_history else raw_roll

                    # High responsiveness on active movement, stable filtering when still
                    alpha_yaw = 0.85 if abs(raw_yaw - last_yaw) > 3.5 else 0.55
                    alpha_pitch = 0.85 if abs(raw_pitch - last_pitch) > 3.0 else 0.55

                    yaw = float(raw_yaw * alpha_yaw + last_yaw * (1.0 - alpha_yaw))
                    pitch = float(raw_pitch * alpha_pitch + last_pitch * (1.0 - alpha_pitch))
                    roll = float(raw_roll * 0.70 + last_roll * 0.30)

                    self._yaw_history.append(yaw)
                    self._pitch_history.append(pitch)
                    self._roll_history.append(roll)

                    # Determine gaze direction from candidate's perspective
                    direction = "FORWARD"
                    frame_suspicious = False

                    if yaw > self.yaw_threshold:
                        direction = "LOOKING_LEFT"
                        frame_suspicious = True
                    elif yaw < -self.yaw_threshold:
                        direction = "LOOKING_RIGHT"
                        frame_suspicious = True
                    elif pitch > self.pitch_threshold:
                        direction = "LOOKING_DOWN"
                        frame_suspicious = True
                    elif pitch < -self.pitch_threshold:
                        direction = "LOOKING_UP"
                        frame_suspicious = True

                    if frame_suspicious:
                        self._consecutive_suspicious += 1
                    else:
                        self._consecutive_suspicious = max(0, self._consecutive_suspicious - 1)

                    is_suspicious = self._consecutive_suspicious >= self._suspicious_threshold
                    confidence = min(0.99, 0.88 + (self._consecutive_suspicious * 0.04))

                    return {
                        "detected": True,
                        "pitch": round(pitch, 1),
                        "yaw": round(yaw, 1),
                        "roll": round(roll, 1),
                        "direction": direction,
                        "is_suspicious": is_suspicious,
                        "confidence": round(confidence, 2)
                    }
            except Exception as e:
                logger.debug(f"solvePnP estimation note: {e}")

        # 2. Geometric fallback (based on face bounding box center offset)
        from backend.ai.face_detection import face_detector
        faces = face_detector.detect_faces(image)
        if faces:
            x1, y1, x2, y2 = faces[0]["bbox"]
            face_center_x = (x1 + x2) / 2
            face_center_y = (y1 + y2) / 2
            
            offset_x = (face_center_x - (w / 2)) / (w / 2) # -1.0 to 1.0 (image coords)
            offset_y = (face_center_y - (h / 2)) / (h / 2)
            
            # Candidate moving/turning to candidate's LEFT appears on image RIGHT (offset_x > 0 -> yaw > 0)
            # Candidate moving/turning to candidate's RIGHT appears on image LEFT (offset_x < 0 -> yaw < 0)
            yaw = float(offset_x * 40.0)
            pitch = float(offset_y * 30.0)
            
            direction = "FORWARD"
            is_suspicious = False
            if yaw > self.yaw_threshold:
                direction = "LOOKING_LEFT"
                is_suspicious = True
            elif yaw < -self.yaw_threshold:
                direction = "LOOKING_RIGHT"
                is_suspicious = True
            elif pitch > self.pitch_threshold:
                direction = "LOOKING_DOWN"
                is_suspicious = True
            elif pitch < -self.pitch_threshold:
                direction = "LOOKING_UP"
                is_suspicious = True
                
            return {
                "detected": True,
                "pitch": round(pitch, 1),
                "yaw": round(yaw, 1),
                "roll": 0.0,
                "direction": direction,
                "is_suspicious": is_suspicious,
                "confidence": 0.78
            }

        return {
            "detected": False,
            "pitch": 0.0,
            "yaw": 0.0,
            "roll": 0.0,
            "direction": "FORWARD",
            "is_suspicious": False,
            "confidence": 0.0
        }

gaze_detector = GazeDetector()
