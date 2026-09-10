import os
import cv2
import numpy as np
import logging

logger = logging.getLogger(__name__)

# Key landmark index groupings for MediaPipe FaceMesh
FACEMESH_GROUPS = {
    "face_oval": [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
    "left_eyebrow": [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
    "right_eyebrow": [336, 296, 334, 293, 300, 276, 283, 282, 295, 285],
    "left_eye": [33, 160, 158, 133, 153, 144],
    "right_eye": [263, 387, 385, 362, 380, 373],
    "nose": [168, 6, 197, 1, 2, 98, 327],
    "lips": [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185],
    "left_iris": [468, 469, 470, 471, 472],
    "right_iris": [473, 474, 475, 476, 477]
}

class FaceDetector:
    """
    High-accuracy Multi-Stage Face & Biometric Landmark Detector supporting:
    1. MediaPipe FaceMesh with 468/478 refined 3D landmarks and anatomical contours.
    2. MediaPipe Face Detection (short-range <2m & full-range <5m).
    3. OpenCV YuNet Deep Neural Network.
    4. CLAHE-equalized Haar Cascade fallback.
    """
    def __init__(self, min_detection_confidence=0.20):
        self.min_detection_confidence = min_detection_confidence
        self.detector_short = None
        self.detector_full = None
        self.face_mesh = None
        self.yunet_detector = None
        self.haar_cascade = None
        self.yolo_model = None
        self._init_models()

    def _init_models(self):
        # 1. Primary high-precision: MediaPipe FaceMesh (dense 3D biometric landmarks)
        try:
            import mediapipe as mp
            self.face_mesh = mp.solutions.face_mesh.FaceMesh(
                max_num_faces=4,
                refine_landmarks=True,
                min_detection_confidence=0.20,
                min_tracking_confidence=0.20
            )
            logger.info("MediaPipe FaceMesh initialized successfully.")
        except Exception as e:
            logger.warning(f"MediaPipe FaceMesh init notice: {e}")

        # 2. Secondary: MediaPipe Face Detection (Short-range < 2m)
        try:
            import mediapipe as mp
            self.detector_short = mp.solutions.face_detection.FaceDetection(
                min_detection_confidence=self.min_detection_confidence,
                model_selection=0
            )
            logger.info("MediaPipe Face Detection (Short-Range) initialized successfully.")
        except Exception as e:
            logger.warning(f"MediaPipe short-range init notice: {e}")

        # 3. Tertiary: MediaPipe Face Detection (Full-range < 5m)
        try:
            import mediapipe as mp
            self.detector_full = mp.solutions.face_detection.FaceDetection(
                min_detection_confidence=self.min_detection_confidence,
                model_selection=1
            )
            logger.info("MediaPipe Face Detection (Full-Range) initialized successfully.")
        except Exception as e:
            logger.warning(f"MediaPipe full-range init notice: {e}")

        # 4. Quaternary: OpenCV YuNet Deep Neural Network
        yunet_weights = os.path.join("models", "weights", "face_detection_yunet_2023mar.onnx")
        if os.path.exists(yunet_weights) and hasattr(cv2, "FaceDetectorYN"):
            try:
                self.yunet_detector = cv2.FaceDetectorYN.create(yunet_weights, "", (320, 320), 0.35, 0.3, 5000)
                logger.info("OpenCV YuNet Face Detector initialized successfully.")
            except Exception as e:
                logger.warning(f"YuNet init notice: {e}")

        # 5. Haar Cascade Fallback
        try:
            if hasattr(cv2, "data") and hasattr(cv2.data, "haarcascades"):
                cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
                if os.path.exists(cascade_path):
                    self.haar_cascade = cv2.CascadeClassifier(cascade_path)
        except Exception as e:
            logger.debug(f"Haar cascade init notice: {e}")

        # 6. YOLOv8 fallback
        try:
            from ultralytics import YOLO
            model_path = "yolov8n.pt"
            if os.path.exists(model_path):
                self.yolo_model = YOLO(model_path)
                logger.info("YOLOv8 fallback model loaded successfully.")
        except Exception as e:
            logger.debug(f"YOLO fallback notice: {e}")

    @property
    def detector(self):
        return self.detector_short

    def _process_facemesh_detections(self, multi_face_landmarks, w, h):
        """Extracts high-precision anatomically stabilized bounding box and facial contours from FaceMesh."""
        faces = []
        for face_lms in multi_face_landmarks:
            lms = face_lms.landmark
            num_lms = len(lms)
            
            # Pixel landmark coordinates
            pts = np.array([[lm.x * w, lm.y * h, lm.z * w] for lm in lms], dtype=np.float32)
            xs = pts[:, 0]
            ys = pts[:, 1]
            
            # Robust skull bounding box from face oval and key anatomical points
            min_x, max_x = float(np.min(xs)), float(np.max(xs))
            min_y, max_y = float(np.min(ys)), float(np.max(ys))
            bw = max_x - min_x
            bh = max_y - min_y

            # Proportional anatomical margins (headroom + chin buffer)
            pad_x = bw * 0.08
            pad_y_top = bh * 0.18
            pad_y_bot = bh * 0.06

            x1 = max(0, int(min_x - pad_x))
            y1 = max(0, int(min_y - pad_y_top))
            x2 = min(w, int(max_x + pad_x))
            y2 = min(h, int(max_y + pad_y_bot))

            # 5 Key Facial Reference Landmarks for standard overlays
            key_landmarks = [
                [int(pts[263][0]), int(pts[263][1])],  # Left eye
                [int(pts[33][0]), int(pts[33][1])],    # Right eye
                [int(pts[1][0]), int(pts[1][1])],      # Nose tip
                [int(pts[291][0]), int(pts[291][1])],  # Left mouth corner
                [int(pts[61][0]), int(pts[61][1])]     # Right mouth corner
            ]

            # 3D Anchors for solvePnP pose estimation (fully JSON serializable)
            key_points_3d = {
                "1": [round(float(pts[1][0]), 1), round(float(pts[1][1]), 1)],
                "152": [round(float(pts[152][0]), 1), round(float(pts[152][1]), 1)],
                "263": [round(float(pts[263][0]), 1), round(float(pts[263][1]), 1)],
                "33": [round(float(pts[33][0]), 1), round(float(pts[33][1]), 1)],
                "291": [round(float(pts[291][0]), 1), round(float(pts[291][1]), 1)],
                "61": [round(float(pts[61][0]), 1), round(float(pts[61][1]), 1)],
                "10": [round(float(pts[10][0]), 1), round(float(pts[10][1]), 1)],
            }
            if num_lms >= 478:
                key_points_3d["iris"] = {
                    "l_iris": [round(float(pts[468][0]), 1), round(float(pts[468][1]), 1)],
                    "l_inner": [round(float(pts[362][0]), 1), round(float(pts[362][1]), 1)],
                    "l_outer": [round(float(pts[263][0]), 1), round(float(pts[263][1]), 1)],
                    "r_iris": [round(float(pts[473][0]), 1), round(float(pts[473][1]), 1)],
                    "r_inner": [round(float(pts[133][0]), 1), round(float(pts[133][1]), 1)],
                    "r_outer": [round(float(pts[33][0]), 1), round(float(pts[33][1]), 1)]
                }

            # Extract structured anatomical contours
            contours = {}
            for group_name, indices in FACEMESH_GROUPS.items():
                group_pts = []
                for idx in indices:
                    if idx < num_lms:
                        group_pts.append([round(float(pts[idx][0]), 1), round(float(pts[idx][1]), 1)])
                if group_pts:
                    contours[group_name] = group_pts

            faces.append({
                "bbox": [x1, y1, x2, y2],
                "landmarks": key_landmarks,
                "key_points_3d": key_points_3d,
                "contours": contours,
                "confidence": 0.98,
                "label": "Candidate Face",
                "color": (0, 255, 0)
            })

        return faces

    def _process_mp_detections(self, detections, w, h):
        faces = []
        for det in detections:
            conf = float(det.score[0]) if det.score else 1.0
            if conf < self.min_detection_confidence:
                continue

            bbox = det.location_data.relative_bounding_box
            raw_x1 = bbox.xmin * w
            raw_y1 = bbox.ymin * h
            raw_bw = bbox.width * w
            raw_bh = bbox.height * h

            # Padding for full facial coverage
            pad_x = raw_bw * 0.05
            pad_y_top = raw_bh * 0.12
            pad_y_bot = raw_bh * 0.05

            x1 = max(0, int(raw_x1 - pad_x))
            y1 = max(0, int(raw_y1 - pad_y_top))
            x2 = min(w, int(raw_x1 + raw_bw + pad_x))
            y2 = min(h, int(raw_y1 + raw_bh + pad_y_bot))

            if (y2 - y1) < h * 0.03 or (x2 - x1) < w * 0.03:
                continue

            landmarks = []
            if det.location_data.keypoints:
                for kp in det.location_data.keypoints:
                    landmarks.append([int(kp.x * w), int(kp.y * h)])

            faces.append({
                "bbox": [x1, y1, x2, y2],
                "landmarks": landmarks,
                "contours": {},
                "confidence": round(conf, 3),
                "label": "Candidate Face",
                "color": (0, 255, 0)
            })
        return faces

    def _process_yunet_detections(self, yn_faces, w, h):
        faces = []
        if yn_faces is None:
            return faces
        for face in yn_faces:
            conf = float(face[14])
            if conf < 0.35:
                continue
            x1 = max(0, int(face[0]))
            y1 = max(0, int(face[1]))
            bw = int(face[2])
            bh = int(face[3])
            x2 = min(w, x1 + bw)
            y2 = min(h, y1 + bh)

            landmarks = [
                [int(face[4]), int(face[5])],
                [int(face[6]), int(face[7])],
                [int(face[8]), int(face[9])],
                [int(face[10]), int(face[11])],
                [int(face[12]), int(face[13])]
            ]
            faces.append({
                "bbox": [x1, y1, x2, y2],
                "landmarks": landmarks,
                "contours": {},
                "confidence": round(conf, 3),
                "label": "Candidate Face",
                "color": (0, 255, 0)
            })
        return faces

    def _detect_haar_fallback(self, image, w, h):
        if self.haar_cascade is None:
            return []
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            cl = clahe.apply(gray)
            rects = self.haar_cascade.detectMultiScale(cl, scaleFactor=1.1, minNeighbors=4, minSize=(40, 40))
            faces = []
            for (x, y, bw, bh) in rects:
                faces.append({
                    "bbox": [int(x), int(y), int(min(w, x + bw)), int(min(h, y + bh))],
                    "landmarks": [],
                    "contours": {},
                    "confidence": 0.80,
                    "label": "Candidate Face",
                    "color": (0, 255, 0)
                })
            return faces
        except Exception as e:
            logger.debug(f"Haar fallback note: {e}")
            return []

    def detect_faces(self, image: np.ndarray):
        """
        Detects faces in BGR image using prioritized multi-stage detection pipeline:
        Stage 1: MediaPipe FaceMesh (High Precision 3D & Contours)
        Stage 2: MediaPipe Short-Range Face Detection (<2m)
        Stage 3: MediaPipe Full-Range Face Detection (<5m)
        Stage 4: OpenCV YuNet Deep Neural Network
        Stage 5: CLAHE Haar Cascade Fallback
        """
        if image is None or image.size == 0:
            return []

        h, w, _ = image.shape
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

        # Stage 1: MediaPipe FaceMesh (Primary for sub-pixel accuracy and rich anatomical contours)
        if self.face_mesh is not None:
            try:
                results = self.face_mesh.process(rgb_image)
                if results and results.multi_face_landmarks and len(results.multi_face_landmarks) > 0:
                    faces = self._process_facemesh_detections(results.multi_face_landmarks, w, h)
                    if faces:
                        return self._deduplicate_faces(faces)
            except Exception as e:
                logger.debug(f"MediaPipe FaceMesh inference note: {e}")

        # Stage 2: MediaPipe Short-Range Face Detection
        if self.detector_short is not None:
            try:
                results = self.detector_short.process(rgb_image)
                if results and results.detections:
                    faces = self._process_mp_detections(results.detections, w, h)
                    if faces:
                        return self._deduplicate_faces(faces)
            except Exception as e:
                logger.debug(f"MediaPipe short-range inference note: {e}")

        # Stage 3: MediaPipe Full-Range Face Detection fallback
        if self.detector_full is not None:
            try:
                results = self.detector_full.process(rgb_image)
                if results and results.detections:
                    faces = self._process_mp_detections(results.detections, w, h)
                    if faces:
                        return self._deduplicate_faces(faces)
            except Exception as e:
                logger.debug(f"MediaPipe full-range inference note: {e}")

        # Stage 4: OpenCV YuNet Deep Neural Network
        if self.yunet_detector is not None:
            try:
                self.yunet_detector.setInputSize((w, h))
                _, yn_faces = self.yunet_detector.detect(image)
                if yn_faces is not None and len(yn_faces) > 0:
                    faces = self._process_yunet_detections(yn_faces, w, h)
                    if faces:
                        return self._deduplicate_faces(faces)
            except Exception as e:
                logger.debug(f"YuNet inference note: {e}")

        # Stage 5: Haar Cascade Fallback
        haar_faces = self._detect_haar_fallback(image, w, h)
        if haar_faces:
            return self._deduplicate_faces(haar_faces)

        return []

    def _deduplicate_faces(self, faces, iou_threshold=0.35):
        """Remove overlapping face detections, keeping the one with higher confidence."""
        if len(faces) <= 1:
            return faces

        faces_sorted = sorted(faces, key=lambda f: f.get("confidence", 0), reverse=True)
        kept = []

        for face in faces_sorted:
            is_duplicate = False
            for kept_face in kept:
                if self._compute_iou(face["bbox"], kept_face["bbox"]) > iou_threshold:
                    is_duplicate = True
                    break
            if not is_duplicate:
                kept.append(face)

        return kept

    @staticmethod
    def _compute_iou(box1, box2):
        """Compute Intersection over Union of two [x1,y1,x2,y2] boxes."""
        x1 = max(box1[0], box2[0])
        y1 = max(box1[1], box2[1])
        x2 = min(box1[2], box2[2])
        y2 = min(box1[3], box2[3])
        inter = max(0, x2 - x1) * max(0, y2 - y1)
        area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
        area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
        union = area1 + area2 - inter
        return inter / union if union > 0 else 0

face_detector = FaceDetector()

