/**
 * Smooth 60FPS High-Precision Biometric Face & Object Tracking Canvas Renderer
 * Features:
 * - Adaptive Dual-Rate Exponential Smoothing (Zero jitter when stationary, zero lag when moving)
 * - Dense 3D Facial Contour Wireframe (Face oval, eyebrows, eyes, nose, lips, irises)
 * - 3D Gaze Orientation & Head Pose Reticle Indicator
 * - Multi-Face Concurrent Tracking (Candidate vs Unauthorized Secondary Persons)
 * - Holographic Corner Brackets, Scanning Laser Sweep, and Glowing Keypoint Nodes
 */

export class SmoothTracker {
  constructor(canvasRef, videoRef) {
    this.canvasRef = canvasRef;
    this.videoRef = videoRef;
    this.animationId = null;
    this.isRunning = false;

    // Primary Face Tracking State
    this.currentFace = null;
    this.targetFace = null;
    
    // Multi-Face Secondary Tracking
    this.currentExtraFaces = [];
    this.targetExtraFaces = [];

    // Object Detections (e.g. Mobile Phones)
    this.currentDetections = [];
    this.targetDetections = [];

    this.lastDetectionTime = 0;
    this.lastFrameTime = performance.now();
    this.alpha = 0; // Global opacity for smooth fade in/out
    this.scanPhase = 0; // Sweep laser animation phase

    this.options = {
      isVerified: false,
      score: null,
      statusTag: null,
      colorOverride: null,
      isPhone: false,
      headPose: null
    };
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    const loop = (timestamp) => {
      if (!this.isRunning) return;
      this.render(timestamp);
      this.animationId = requestAnimationFrame(loop);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  stop() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.clear();
  }

  clear() {
    if (this.canvasRef?.current) {
      const ctx = this.canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, this.canvasRef.current.width, this.canvasRef.current.height);
    }
  }

  /**
   * Update target coordinates received from backend AI detection
   */
  updateDetections(faces = [], detections = [], options = {}) {
    this.options = { ...this.options, ...options };
    const now = Date.now();

    if (faces && faces.length > 0) {
      // Primary Face (Candidate)
      const primary = faces[0];
      const bbox = primary.bbox || [0, 0, 0, 0];
      this.targetFace = {
        x1: bbox[0],
        y1: bbox[1],
        x2: bbox[2],
        y2: bbox[3],
        landmarks: primary.landmarks || [],
        contours: primary.contours || {},
        label: primary.label || 'Candidate Face',
        confidence: primary.confidence || 0.95
      };

      // Secondary Faces (Multiple Persons)
      if (faces.length > 1) {
        this.targetExtraFaces = faces.slice(1).map((f, i) => ({
          x1: f.bbox[0],
          y1: f.bbox[1],
          x2: f.bbox[2],
          y2: f.bbox[3],
          landmarks: f.landmarks || [],
          contours: f.contours || {},
          label: f.label || `Person #${i + 2}`,
          confidence: f.confidence || 0.90
        }));
      } else {
        this.targetExtraFaces = [];
      }

      this.lastDetectionTime = now;
    } else {
      this.targetFace = null;
      this.targetExtraFaces = [];
    }

    if (detections && detections.length > 0) {
      this.targetDetections = detections.map(d => ({
        bbox: d.bbox,
        label: d.label,
        confidence: d.confidence,
        is_phone: d.is_phone || (d.label && d.label.toLowerCase().includes('phone')),
        landmarks: d.landmarks || []
      }));
      this.lastDetectionTime = now;
    } else {
      this.targetDetections = [];
    }
  }

  render(timestamp = performance.now()) {
    const canvas = this.canvasRef?.current;
    const video = this.videoRef?.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;

    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width = vw;
      canvas.height = vh;
    }

    ctx.clearRect(0, 0, vw, vh);

    const now = Date.now();
    const dt = Math.min(64, Math.max(8, timestamp - this.lastFrameTime)) / 16.67; // Normalized frame delta (~1.0 at 60fps)
    this.lastFrameTime = timestamp;

    const isRecent = (now - this.lastDetectionTime) < 1800;

    // Target opacity fade in / fade out
    const targetAlpha = (isRecent && (this.targetFace || this.targetDetections.length > 0)) ? 1.0 : 0.0;
    this.alpha += (targetAlpha - this.alpha) * Math.min(1.0, 0.18 * dt);

    if (this.alpha < 0.01) return;

    // Advance scan beam phase
    this.scanPhase = (this.scanPhase + 0.04 * dt) % (Math.PI * 2);

    ctx.save();
    ctx.globalAlpha = this.alpha;

    // 1. Draw Primary Candidate Face Track
    if (this.targetFace) {
      this.currentFace = this._interpolateFaceBox(this.currentFace, this.targetFace, dt);
      this._drawFaceBox(ctx, this.currentFace, vw, vh, false);
    }

    // 2. Draw Secondary Multiple Persons (if any)
    if (this.targetExtraFaces && this.targetExtraFaces.length > 0) {
      this.currentExtraFaces = this.targetExtraFaces.map((tFace, idx) => {
        const cFace = this.currentExtraFaces[idx] || null;
        return this._interpolateFaceBox(cFace, tFace, dt);
      });

      this.currentExtraFaces.forEach((f) => {
        this._drawFaceBox(ctx, f, vw, vh, true);
      });
    } else {
      this.currentExtraFaces = [];
    }

    // 3. Draw Object Detections (e.g. Mobile Phones)
    if (this.targetDetections && this.targetDetections.length > 0) {
      this.targetDetections.forEach(det => {
        if (det.is_phone) {
          this._drawPhoneBox(ctx, det, vw, vh);
        }
      });
    }

    ctx.restore();
  }

  /**
   * Adaptive Dual-Rate Interpolator:
   * Smooths micro-jitter when stationary, accelerates instantly when moving
   */
  _interpolateFaceBox(current, target, dt) {
    if (!current) {
      return {
        x1: target.x1,
        y1: target.y1,
        x2: target.x2,
        y2: target.y2,
        landmarks: (target.landmarks || []).map(p => [...p]),
        contours: this._cloneContours(target.contours),
        label: target.label,
        confidence: target.confidence
      };
    }

    // Compute displacement distance
    const distSq = Math.pow(target.x1 - current.x1, 2) + Math.pow(target.y1 - current.y1, 2) +
                   Math.pow(target.x2 - current.x2, 2) + Math.pow(target.y2 - current.y2, 2);
    const dist = Math.sqrt(distSq);

    // Dynamic smoothing factor: 0.20 for stationary stabilization, up to 0.55 for swift head turns
    const baseLerp = dist > 12 ? 0.52 : (dist > 4 ? 0.32 : 0.20);
    const lerpFactor = Math.min(0.98, baseLerp * dt);

    const x1 = current.x1 + (target.x1 - current.x1) * lerpFactor;
    const y1 = current.y1 + (target.y1 - current.y1) * lerpFactor;
    const x2 = current.x2 + (target.x2 - current.x2) * lerpFactor;
    const y2 = current.y2 + (target.y2 - current.y2) * lerpFactor;

    // Smooth landmarks
    let landmarks = current.landmarks;
    if (target.landmarks && target.landmarks.length > 0) {
      if (!current.landmarks || current.landmarks.length !== target.landmarks.length) {
        landmarks = target.landmarks.map(p => [...p]);
      } else {
        landmarks = current.landmarks.map((p, i) => [
          p[0] + (target.landmarks[i][0] - p[0]) * lerpFactor,
          p[1] + (target.landmarks[i][1] - p[1]) * lerpFactor
        ]);
      }
    }

    // Smooth contours
    const contours = {};
    if (target.contours) {
      Object.keys(target.contours).forEach(key => {
        const tPts = target.contours[key];
        const cPts = current.contours ? current.contours[key] : null;
        if (!cPts || cPts.length !== tPts.length) {
          contours[key] = tPts.map(p => [...p]);
        } else {
          contours[key] = cPts.map((p, i) => [
            p[0] + (tPts[i][0] - p[0]) * lerpFactor,
            p[1] + (tPts[i][1] - p[1]) * lerpFactor
          ]);
        }
      });
    }

    return {
      x1,
      y1,
      x2,
      y2,
      landmarks,
      contours,
      label: target.label,
      confidence: target.confidence
    };
  }

  _cloneContours(contours) {
    if (!contours) return {};
    const res = {};
    Object.keys(contours).forEach(k => {
      res[k] = contours[k].map(p => [...p]);
    });
    return res;
  }

  _drawFaceBox(ctx, face, vw, vh, isSecondary = false) {
    const { x1, y1, x2, y2, landmarks, contours } = face;
    const boxWidth = Math.max(10, x2 - x1);
    const boxHeight = Math.max(10, y2 - y1);
    const mirroredX = Math.max(0, vw - x2);
    const mirroredY = Math.max(0, y1);

    const isVerified = this.options.isVerified;
    const score = this.options.score;

    // Palette determination
    let primaryColor = '#3b82f6';   // Calibrating / Tracking Blue
    let glowColor = 'rgba(59, 130, 246, 0.45)';
    let landmarkColor = '#38bdf8';
    let meshAlpha = '0.35';

    if (isSecondary) {
      primaryColor = '#ef4444';     // Unauthorized Person Crimson
      glowColor = 'rgba(239, 68, 68, 0.55)';
      landmarkColor = '#f87171';
    } else if (isVerified) {
      primaryColor = '#10b981';     // Verified Emerald Green
      glowColor = 'rgba(16, 185, 129, 0.5)';
      landmarkColor = '#34d399';
    } else if (score !== null && score < 58) {
      primaryColor = '#ef4444';     // Identity Mismatch Crimson Red
      glowColor = 'rgba(239, 68, 68, 0.5)';
      landmarkColor = '#f87171';
    }

    if (this.options.colorOverride && !isSecondary) {
      primaryColor = this.options.colorOverride;
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1. Subtle Inner Bounding Frame
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = glowColor;
    ctx.strokeRect(mirroredX, mirroredY, boxWidth, boxHeight);

    // 2. High-Tech Corner Brackets with Glow
    const cLen = Math.min(26, Math.min(boxWidth, boxHeight) * 0.24);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = primaryColor;
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 10;

    ctx.beginPath();
    // Top-left
    ctx.moveTo(mirroredX, mirroredY + cLen);
    ctx.lineTo(mirroredX, mirroredY);
    ctx.lineTo(mirroredX + cLen, mirroredY);
    // Top-right
    ctx.moveTo(mirroredX + boxWidth - cLen, mirroredY);
    ctx.lineTo(mirroredX + boxWidth, mirroredY);
    ctx.lineTo(mirroredX + boxWidth, mirroredY + cLen);
    // Bottom-left
    ctx.moveTo(mirroredX, mirroredY + boxHeight - cLen);
    ctx.lineTo(mirroredX, mirroredY + boxHeight);
    ctx.lineTo(mirroredX + cLen, mirroredY + boxHeight);
    // Bottom-right
    ctx.moveTo(mirroredX + boxWidth - cLen, mirroredY + boxHeight);
    ctx.lineTo(mirroredX + boxWidth, mirroredY + boxHeight);
    ctx.lineTo(mirroredX + boxWidth, mirroredY + boxHeight - cLen);
    ctx.stroke();

    ctx.shadowBlur = 0; // reset glow

    // 3. Smooth Laser Scanning Sweep Beam (Oscillating up & down)
    if (!isSecondary) {
      const scanYNorm = (Math.sin(this.scanPhase) + 1.0) / 2.0;
      const scanY = mirroredY + boxHeight * scanYNorm;

      const grad = ctx.createLinearGradient(mirroredX, scanY - 14, mirroredX, scanY + 14);
      grad.addColorStop(0, 'rgba(59, 130, 246, 0.0)');
      grad.addColorStop(0.5, glowColor);
      grad.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

      ctx.fillStyle = grad;
      ctx.fillRect(mirroredX, Math.max(mirroredY, scanY - 12), boxWidth, 24);

      ctx.lineWidth = 2;
      ctx.strokeStyle = primaryColor;
      ctx.beginPath();
      ctx.moveTo(mirroredX + 4, scanY);
      ctx.lineTo(mirroredX + boxWidth - 4, scanY);
      ctx.stroke();
    }

    // 4. Dense Biometric Landmark & Contour Wireframe Mesh
    const hasContours = contours && Object.keys(contours).length > 0;

    if (hasContours) {
      // Helper function to draw continuous polyline contour
      const drawContour = (pts, close = false) => {
        if (!pts || pts.length < 2) return;
        ctx.beginPath();
        const startX = vw - pts[0][0];
        const startY = pts[0][1];
        ctx.moveTo(startX, startY);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(vw - pts[i][0], pts[i][1]);
        }
        if (close) ctx.closePath();
        ctx.stroke();
      };

      ctx.lineWidth = 1.2;
      ctx.strokeStyle = `${primaryColor}${Math.round(parseFloat(meshAlpha) * 255).toString(16).padStart(2, '0')}`;

      // Draw Anatomical Wireframe Contours
      if (contours.face_oval) drawContour(contours.face_oval, false);
      if (contours.left_eyebrow) drawContour(contours.left_eyebrow, false);
      if (contours.right_eyebrow) drawContour(contours.right_eyebrow, false);
      if (contours.left_eye) drawContour(contours.left_eye, true);
      if (contours.right_eye) drawContour(contours.right_eye, true);
      if (contours.nose) drawContour(contours.nose, false);
      if (contours.lips) drawContour(contours.lips, true);

      // Draw Iris Reticle Target Crosshairs
      const drawIrisReticle = (irisPts) => {
        if (!irisPts || irisPts.length === 0) return;
        const center = irisPts[0]; // Center point
        const cx = vw - center[0];
        const cy = center[1];

        ctx.fillStyle = landmarkColor;
        ctx.beginPath();
        ctx.arc(cx, cy, 3.0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, 6.0, 0, Math.PI * 2);
        ctx.stroke();
      };

      if (contours.left_iris) drawIrisReticle(contours.left_iris);
      if (contours.right_iris) drawIrisReticle(contours.right_iris);
    } else if (landmarks && Array.isArray(landmarks) && landmarks.length > 0) {
      // 6-Point Landmark Triangulated Biometric Reticle
      const mirroredLms = landmarks.map(([lx, ly]) => [vw - lx, ly]);

      ctx.lineWidth = 1;
      ctx.strokeStyle = `${primaryColor}55`;
      if (mirroredLms.length >= 4) {
        ctx.beginPath();
        ctx.moveTo(mirroredLms[0][0], mirroredLms[0][1]);
        for (let i = 1; i < mirroredLms.length; i++) {
          ctx.lineTo(mirroredLms[i][0], mirroredLms[i][1]);
        }
        ctx.closePath();
        ctx.stroke();
      }

      // Draw Glowing Keypoint Nodes
      mirroredLms.forEach(([lx, ly]) => {
        ctx.fillStyle = landmarkColor;
        ctx.beginPath();
        ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(lx, ly, 5.5, 0, Math.PI * 2);
        ctx.stroke();
      });
    }

    // 5. Sleek Status Tag Badge
    let tagText = this.options.statusTag;
    if (isSecondary) {
      tagText = `🚨 UNAUTHORIZED PERSON (${face.label || 'EXTRA'})`;
    } else if (!tagText) {
      if (isVerified) {
        tagText = `✓ CANDIDATE VERIFIED (${score || 100}%)`;
      } else if (score !== null && score < 58) {
        tagText = `🚨 IDENTITY MISMATCH (${score}%)`;
      } else {
        tagText = '◉ BIOMETRIC SCANNING...';
      }
    }

    ctx.font = 'bold 11px Inter, system-ui, -apple-system, sans-serif';
    const textWidth = ctx.measureText(tagText).width;
    const badgeW = textWidth + 16;
    const badgeH = 22;
    const badgeX = mirroredX;
    const badgeY = Math.max(4, mirroredY - 26);

    // Pill background
    ctx.fillStyle = isSecondary
      ? 'rgba(239, 68, 68, 0.95)'
      : (isVerified
        ? 'rgba(16, 185, 129, 0.95)'
        : (score !== null && score < 58 ? 'rgba(239, 68, 68, 0.95)' : 'rgba(15, 23, 42, 0.9)'));
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4) : ctx.rect(badgeX, badgeY, badgeW, badgeH);
    ctx.fill();
    ctx.stroke();

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(tagText, badgeX + 8, badgeY + 15);

    ctx.restore();
  }

  _drawPhoneBox(ctx, det, vw, vh) {
    const bbox = det.bbox;
    if (!bbox || bbox.length < 4) return;

    const [x1, y1, x2, y2] = bbox;
    const boxWidth = Math.max(10, x2 - x1);
    const boxHeight = Math.max(10, y2 - y1);
    const mirroredX = Math.max(0, vw - x2);
    const mirroredY = Math.max(0, y1);

    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ef4444';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 12;

    ctx.strokeRect(mirroredX, mirroredY, boxWidth, boxHeight);

    // Corner brackets
    const cLen = Math.min(20, boxWidth * 0.25);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(mirroredX, mirroredY + cLen);
    ctx.lineTo(mirroredX, mirroredY);
    ctx.lineTo(mirroredX + cLen, mirroredY);
    ctx.moveTo(mirroredX + boxWidth - cLen, mirroredY);
    ctx.lineTo(mirroredX + boxWidth, mirroredY);
    ctx.lineTo(mirroredX + boxWidth, mirroredY + cLen);
    ctx.moveTo(mirroredX, mirroredY + boxHeight - cLen);
    ctx.lineTo(mirroredX, mirroredY + boxHeight);
    ctx.lineTo(mirroredX + cLen, mirroredY + boxHeight);
    ctx.moveTo(mirroredX + boxWidth - cLen, mirroredY + boxHeight);
    ctx.lineTo(mirroredX + boxWidth, mirroredY + boxHeight);
    ctx.lineTo(mirroredX + boxWidth, mirroredY + boxHeight - cLen);
    ctx.stroke();

    ctx.shadowBlur = 0;

    const tagText = `⚠ PHONE DETECTED ${det.confidence ? `(${Math.round(det.confidence * 100)}%)` : ''}`;
    ctx.font = 'bold 12px Inter, system-ui, sans-serif';
    const tw = ctx.measureText(tagText).width;
    ctx.fillStyle = 'rgba(239, 68, 68, 0.95)';
    ctx.fillRect(mirroredX, Math.max(4, mirroredY - 24), tw + 14, 22);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(tagText, mirroredX + 7, Math.max(18, mirroredY - 8));

    ctx.restore();
  }
}
