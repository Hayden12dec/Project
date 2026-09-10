import React, { useState, useRef, useEffect } from 'react';
import { auth } from '../services/auth';
import { api } from '../services/api';
import { SmoothTracker } from '../utils/faceTrackerRenderer';
import {
  Shield,
  Camera,
  CheckCircle2,
  XCircle,
  ArrowRight,
  User,
  Mail,
  KeyRound,
  AlertCircle,
  RefreshCw,
  Sun,
  UserCheck,
  Check
} from 'lucide-react';

export default function Register({ onRegisterSuccess, navigateToLogin }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [faceReference, setFaceReference] = useState(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [validatingFace, setValidatingFace] = useState(false);
  const [faceStatus, setFaceStatus] = useState({
    face_detected: false,
    single_person: false,
    lighting_ok: false,
    brightness_score: 0,
    face_count: 0
  });
  const [faceFeedback, setFaceFeedback] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const trackerRef = useRef(null);

  const startCamera = async () => {
    setError(null);
    setFaceFeedback('Starting webcam...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false
      });
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err) {
      console.error('Camera access error:', err);
      setError('Camera access denied or webcam device unavailable. Please allow browser camera permissions.');
      setFaceFeedback(null);
    }
  };

  const stopCamera = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (trackerRef.current) {
      trackerRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  // Ensure video element receives stream and starts live smooth detection loop
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(e => console.warn('Video play error:', e));

      // Start 60fps smooth interpolation tracker
      if (!trackerRef.current && overlayRef.current) {
        trackerRef.current = new SmoothTracker(overlayRef, videoRef);
      }
      if (trackerRef.current) {
        trackerRef.current.start();
      }

      // Periodic live AI face detection to update target coordinates
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(async () => {
        if (!cameraActive || validatingFace) return;
        const snapshotB64 = getSnapshot();
        if (!snapshotB64) return;
        try {
          const res = await api.post('/auth/validate-face', { image_base64: snapshotB64 });
          setFaceStatus({
            face_detected: res.face_detected,
            single_person: res.single_person,
            lighting_ok: res.lighting_ok,
            brightness_score: res.brightness_score,
            face_count: res.face_count || 0
          });
          
          if (trackerRef.current) {
            trackerRef.current.updateDetections(res.faces, [], {
              isVerified: res.success,
              statusTag: res.success ? '✓ BIOMETRICS ALIGNED' : '◉ CALIBRATING FACE...'
            });
          }
          
          if (res.success) {
            setFaceFeedback('✓ Single face detected with optimal lighting. Ready to capture!');
          } else {
            setFaceFeedback(res.message);
          }
        } catch (e) {
          // ignore background ping errors
        }
      }, 750);
    }
  }, [cameraActive]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const getSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0) return null;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
  };

  const handleCaptureAndValidate = async () => {
    const snapshotB64 = getSnapshot();
    if (!snapshotB64) return;

    setValidatingFace(true);
    setFaceFeedback('Analyzing facial presence and biometric lighting...');

    try {
      const res = await api.post('/auth/validate-face', {
        image_base64: snapshotB64
      });

      setFaceStatus({
        face_detected: res.face_detected,
        single_person: res.single_person,
        lighting_ok: res.lighting_ok,
        brightness_score: res.brightness_score,
        face_count: res.face_count || 0
      });

      drawFaceOverlay(res.faces, res.success);

      if (res.success) {
        setFaceReference(snapshotB64);
        setFaceFeedback('✓ Biometric face reference successfully captured and validated!');
        stopCamera();
      } else {
        setFaceFeedback(res.message || 'Face detection did not meet quality requirements.');
      }
    } catch (err) {
      console.error('Face validation error:', err);
      // Fallback: accept photo if offline or API error
      setFaceReference(snapshotB64);
      setFaceFeedback('Snapshot saved.');
      stopCamera();
    } finally {
      setValidatingFace(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const user = await auth.register({
        name,
        email,
        student_id: studentId || `STU${Date.now() % 10000}`,
        password,
        role: 'student',
        face_reference: faceReference
      });
      onRegisterSuccess(user);
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      backgroundColor: 'var(--bg-primary)',
      backgroundImage: 'radial-gradient(ellipse at 50% 10%, rgba(59, 130, 246, 0.12), transparent 70%)'
    }}>
      <div className="glass-card" style={{ maxWidth: '540px', width: '100%', padding: '2.25rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            display: 'inline-flex',
            padding: '0.65rem',
            borderRadius: '12px',
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            color: 'var(--accent-blue)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            marginBottom: '0.75rem'
          }}>
            <Shield size={28} />
          </div>
          <h2 style={{ fontSize: '1.45rem', marginBottom: '0.25rem' }}>Student Candidate Registration</h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
            Enroll your profile and facial reference for automated proctoring verification
          </p>
        </div>

        {error && (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#fca5a5',
            padding: '0.65rem 0.85rem',
            borderRadius: '8px',
            fontSize: '0.825rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1.25rem'
          }}>
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                type="text"
                required
                className="form-input"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Student ID / Roll No</label>
              <input
                type="text"
                required
                className="form-input"
                placeholder="STU202401"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              required
              className="form-input"
              placeholder="candidate@university.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Security Password</label>
            <input
              type="password"
              required
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {/* AI Face Reference Enrollment Card */}
          <div className="form-group" style={{
            backgroundColor: 'var(--bg-secondary)',
            padding: '1.2rem',
            borderRadius: '10px',
            border: '1px solid var(--border-color)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <UserCheck size={16} color="var(--accent-blue)" /> Facial Reference Enrollment
              </span>
              {faceReference && (
                <span className="badge badge-low" style={{ fontSize: '0.72rem' }}>
                  <CheckCircle2 size={12} /> Baseline Enrolled
                </span>
              )}
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.85rem', lineHeight: 1.4 }}>
              Take a clear front-facing camera snapshot. The AI extracts your biometric face representation so your identity is automatically matched and verified during examinations.
            </p>

            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {!cameraActive && !faceReference && (
              <button
                type="button"
                onClick={startCamera}
                className="btn btn-secondary btn-sm"
                style={{ width: '100%', padding: '0.65rem', borderColor: 'rgba(59, 130, 246, 0.4)' }}
              >
                <Camera size={16} color="var(--accent-blue)" /> Enable Webcam & Calibrate Face
              </button>
            )}

            {cameraActive && (
              <div>
                <div style={{
                  position: 'relative',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  backgroundColor: '#020617',
                  aspectRatio: '4/3',
                  border: '1px solid var(--border-color)',
                  marginBottom: '0.75rem'
                }}>
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                  />
                  <canvas
                    ref={overlayRef}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none'
                    }}
                  />
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    color: '#94a3b8'
                  }}>
                    AI Biometric Scanner Active
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={handleCaptureAndValidate}
                    disabled={validatingFace}
                    className="btn btn-success btn-sm"
                    style={{ flex: 1, padding: '0.6rem' }}
                  >
                    {validatingFace ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" /> Validating Biometric Face...
                      </>
                    ) : (
                      <>
                        <Camera size={15} /> Capture & Enroll Face Baseline
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '0.6rem 0.9rem' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {faceReference && !cameraActive && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '0.75rem',
                borderRadius: '8px'
              }}>
                <img
                  src={faceReference}
                  alt="Enrolled Reference Face"
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '6px',
                    objectFit: 'cover',
                    border: '2px solid #10b981',
                    boxShadow: '0 0 10px rgba(16, 185, 129, 0.3)'
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.825rem', fontWeight: 600, color: '#6ee7b7', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Check size={14} /> Biometric Baseline Enrolled
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Your face reference is registered and will match your live camera during exam verification.
                  </div>
                  <button
                    type="button"
                    onClick={startCamera}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-blue)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      marginTop: '6px',
                      padding: 0
                    }}
                  >
                    Retake / Recalibrate Photo
                  </button>
                </div>
              </div>
            )}

            {faceFeedback && cameraActive && (
              <div style={{
                marginTop: '0.5rem',
                fontSize: '0.75rem',
                color: faceStatus.face_detected ? '#6ee7b7' : '#fcd34d',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <AlertCircle size={13} /> {faceFeedback}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem', padding: '0.8rem' }}
          >
            {loading ? 'Creating Candidate Profile...' : 'Complete Registration'} <ArrowRight size={16} />
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
          Already registered?{' '}
          <button
            onClick={navigateToLogin}
            style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', fontWeight: 600 }}
          >
            Sign In to Portal
          </button>
        </div>
      </div>
    </div>
  );
}

