import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { auth } from '../services/auth';
import { AudioMonitor } from '../services/audioService';
import { SmoothTracker } from '../utils/faceTrackerRenderer';
import {
  Camera,
  Mic,
  Sun,
  UserCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Lock,
  ArrowLeft,
  User,
  UserX,
  Users,
  ShieldCheck
} from 'lucide-react';

export default function SystemCheckPage({ exam, onSystemCheckSuccess, onCancel }) {
  const [currentUser, setCurrentUser] = useState(auth.getUser());
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const audioMonitorRef = useRef(null);
  const overlayRef = useRef(null);
  const trackerRef = useRef(null);
  const lastVerifiedSnapshotRef = useRef(null);

  const [streamActive, setStreamActive] = useState(false);
  const [checking, setChecking] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [capturedFaceReference, setCapturedFaceReference] = useState(currentUser?.face_reference || null);

  const [statusChecks, setStatusChecks] = useState({
    camera_ready: false,
    microphone_ready: false,
    lighting_ok: false,
    face_detected: false,
    single_person: false,
    identity_verified: false
  });

  const [verificationFeedback, setVerificationFeedback] = useState(null);
  const [verificationScore, setVerificationScore] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [liveStats, setLiveStats] = useState({ brightness: null, face_count: null });
  const [calibrating, setCalibrating] = useState(false);

  // 1. Fetch fresh user profile on mount to ensure enrolled face reference is loaded
  useEffect(() => {
    async function loadFreshProfile() {
      try {
        const freshUser = await auth.fetchCurrentProfile();
        if (freshUser) {
          setCurrentUser(freshUser);
          if (freshUser.face_reference) {
            setCapturedFaceReference(freshUser.face_reference);
          }
        }
      } catch (e) {
        console.warn('Profile fetch note:', e);
      }
    }
    loadFreshProfile();
  }, []);

  const handleCalibrateFace = async () => {
    const snapshotB64 = getSnapshot();
    if (!snapshotB64) return;
    setCalibrating(true);
    setVerificationFeedback('Calibrating your official candidate facial profile...');
    try {
      const res = await api.post('/proctoring/update-face-reference', {
        image_base64: snapshotB64
      });
      if (res.success) {
        setCapturedFaceReference(snapshotB64);
        setCurrentUser(prev => ({ ...prev, face_reference: snapshotB64 }));
        setVerificationFeedback('✓ Official face profile calibrated successfully. Re-running biometric check...');
        setTimeout(() => runAIHardwareCheck(0), 1000);
      } else {
        setVerificationFeedback(res.message || 'Face calibration failed. Ensure only your face is centered.');
      }
    } catch (err) {
      console.error('Calibration error:', err);
      setVerificationFeedback('Failed to update face reference. Please try again.');
    } finally {
      setCalibrating(false);
    }
  };

  // 2. Hardware initialization (Camera & Microphone & SmoothTracker)
  useEffect(() => {
    let localStream = null;

    async function initHardware() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' }
        });
        localStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setStreamActive(true);
        }

        // Start Smooth 60FPS Face Tracker
        if (!trackerRef.current && overlayRef.current) {
          trackerRef.current = new SmoothTracker(overlayRef, videoRef);
        }
        if (trackerRef.current) {
          trackerRef.current.start();
        }

        const audioMon = new AudioMonitor();
        const micStarted = await audioMon.start();
        audioMonitorRef.current = audioMon;

        setStatusChecks(prev => ({
          ...prev,
          camera_ready: true,
          microphone_ready: micStarted
        }));

        // Trigger AI lighting & face validation after camera auto-exposure stabilizes
        setTimeout(() => runAIHardwareCheck(0), 1800);
      } catch (err) {
        console.error('System hardware initialization failed:', err);
        setVerificationFeedback('Camera or Microphone access was denied. Please grant browser permissions.');
      }
    }

    initHardware();

    return () => {
      if (trackerRef.current) trackerRef.current.stop();
      if (localStream) localStream.getTracks().forEach(t => t.stop());
      if (audioMonitorRef.current) audioMonitorRef.current.stop();
    };
  }, []);

  const getSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
  };

  const runAIHardwareCheck = async (attempt = 0) => {
    const snapshotB64 = getSnapshot();
    if (!snapshotB64) return;
    
    setChecking(true);
    try {
      // 1. Call Backend System Check API
      const res = await api.post('/proctoring/system-check', {
        image_base64: snapshotB64
      });

      const effectiveFaceCount = res.face_count !== undefined ? res.face_count : (res.faces ? res.faces.length : 0);
      const faceDetected = Boolean(res.face_detected && effectiveFaceCount > 0);

      setLiveStats({ brightness: res.brightness_score, face_count: effectiveFaceCount });

      // Handle Student Absent / No Face in camera view
      if (!faceDetected) {
        setVerificationScore(null);
        setStatusChecks(prev => ({
          ...prev,
          camera_ready: res.camera_ready !== undefined ? res.camera_ready : true,
          lighting_ok: res.lighting_ok !== undefined ? res.lighting_ok : true,
          face_detected: false,
          single_person: false,
          identity_verified: false
        }));

        if (trackerRef.current) {
          trackerRef.current.updateDetections([], [], {
            isVerified: false,
            score: null,
            statusTag: '🚨 CANDIDATE ABSENT / NO FACE DETECTED'
          });
        }

        if (!res.lighting_ok) {
          setVerificationFeedback(`Lighting is too dim (${res.brightness_score}/255). Please brighten room lighting.`);
        } else {
          setVerificationFeedback(`🚨 Student Absent: No face detected in camera view. Please position yourself in front of the camera.`);
        }

        setChecking(false);
        return;
      }

      // Handle Multiple Faces
      if (effectiveFaceCount > 1) {
        setStatusChecks(prev => ({
          ...prev,
          camera_ready: true,
          lighting_ok: res.lighting_ok !== undefined ? res.lighting_ok : true,
          face_detected: true,
          single_person: false,
          identity_verified: false
        }));

        if (trackerRef.current) {
          trackerRef.current.updateDetections(res.faces || [], [], {
            isVerified: false,
            score: null,
            statusTag: `🚨 MULTIPLE PERSONS DETECTED (${effectiveFaceCount})`
          });
        }

        setVerificationFeedback(`🚨 Multiple faces detected (${effectiveFaceCount}). Only the single registered candidate is permitted.`);
        setChecking(false);
        return;
      }

      // 2. Exactly ONE face detected -> Call Strict Face Verification against enrolled profile
      const activeRef = currentUser?.face_reference || capturedFaceReference;
      const verifyRes = await api.post('/proctoring/verify-face', {
        reference_image: activeRef,
        query_image: snapshotB64
      });

      const isVerified = Boolean(verifyRes.verified);
      const score = verifyRes.similarity_percent !== undefined
        ? verifyRes.similarity_percent
        : Math.round((verifyRes.similarity || 0) * 100);

      setVerificationScore(score);

      if (isVerified) {
        lastVerifiedSnapshotRef.current = snapshotB64;
      }

      // Smooth 60FPS biometric tracking update
      if (trackerRef.current) {
        trackerRef.current.updateDetections(res.faces && res.faces.length ? res.faces : [], [], {
          isVerified,
          score,
          statusTag: isVerified
            ? `✓ VERIFIED CANDIDATE (${score}%)`
            : `🚨 IDENTITY MISMATCH (${score}%)`
        });
      }

      setStatusChecks(prev => ({
        ...prev,
        camera_ready: res.camera_ready !== undefined ? res.camera_ready : true,
        lighting_ok: res.lighting_ok !== undefined ? res.lighting_ok : true,
        face_detected: true,
        single_person: true,
        identity_verified: isVerified
      }));

      // Determine accurate user feedback
      if (!isVerified) {
        setVerificationFeedback(
          verifyRes.message || `Facial identity mismatch (${score}% match). The person in front of the camera does not match the registered candidate photo.`
        );
      } else {
        setVerificationFeedback(`✓ Biometric identity verified successfully (${score}% match against enrolled ID).`);
      }

      setRetryCount(0);
    } catch (err) {
      console.error('AI check error:', err);
      setVerificationFeedback('AI validation service unreachable. Ensure backend is running.');
    } finally {
      setChecking(false);
    }
  };

  const allChecksPassed =
    statusChecks.camera_ready &&
    statusChecks.microphone_ready &&
    statusChecks.lighting_ok &&
    statusChecks.face_detected &&
    statusChecks.single_person &&
    statusChecks.identity_verified &&
    consentGiven;

  const handleStartExam = () => {
    if (!allChecksPassed) {
      setVerificationFeedback('Cannot start examination: Biometric facial identity check has not passed.');
      return;
    }
    const liveSnapshot = lastVerifiedSnapshotRef.current || getSnapshot();
    if (!liveSnapshot) {
      setVerificationFeedback('Camera snapshot failed. Please ensure camera feed is running.');
      return;
    }
    onSystemCheckSuccess(liveSnapshot);
  };

  return (
    <div className="main-content" style={{ maxWidth: '1140px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <button onClick={onCancel} className="btn btn-secondary btn-sm">
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          <ShieldCheck size={16} color="var(--accent-blue)" />
          <span>Candidate Biometric Verification & Environment Check</span>
        </div>
      </div>

      {/* Identity Mismatch Alert Banner */}
      {!statusChecks.identity_verified && verificationScore !== null && statusChecks.face_detected && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: '8px',
          padding: '0.85rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          color: '#f87171'
        }}>
          <ShieldAlert size={22} style={{ flexShrink: 0 }} />
          <div style={{ fontSize: '0.875rem' }}>
            <strong style={{ display: 'block', fontSize: '0.95rem', marginBottom: '2px', color: '#ef4444' }}>
              🚨 Biometric Facial Identity Mismatch Detected ({verificationScore}% Match)
            </strong>
            The live person in front of the camera does not match the enrolled candidate photo for <strong>{currentUser?.name}</strong> (ID: {currentUser?.student_id || currentUser?.email}). Examination access is locked to prevent impersonation.
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1.3fr) 1fr', gap: '1.75rem', alignItems: 'start' }}>
        {/* Left Column: Live Camera & Biometric Side-by-Side Card */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Camera size={18} color="var(--accent-blue)" /> Live Camera Feed & Biometric Tracing
            </h3>
            <button
              onClick={() => runAIHardwareCheck(0)}
              disabled={checking}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.75rem' }}
            >
              <RefreshCw size={13} className={checking ? 'animate-spin' : ''} />
              {checking ? 'Analyzing...' : 'Re-Scan Face'}
            </button>
          </div>

          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Camera View Area */}
          <div style={{
            position: 'relative',
            borderRadius: '8px',
            overflow: 'hidden',
            backgroundColor: '#020617',
            aspectRatio: '4/3',
            border: `1px solid ${statusChecks.identity_verified ? '#10b981' : (!statusChecks.identity_verified && verificationScore !== null ? '#ef4444' : 'var(--border-color)')}`,
            marginBottom: '1rem'
          }}>
            <video
              ref={videoRef}
              muted
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
            />

            {/* Live Face Tracing Canvas Overlay */}
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

            {/* Mode Tag */}
            <div style={{
              position: 'absolute',
              top: '8px',
              left: '8px',
              backgroundColor: 'rgba(0,0,0,0.65)',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '0.72rem',
              color: '#94a3b8'
            }}>
              Biometric Pre-Check
            </div>

            {/* Live Verification Result Tag */}
            {!statusChecks.face_detected ? (
              <div style={{
                position: 'absolute',
                bottom: '8px',
                right: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.92)',
                color: '#ffffff',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <UserX size={14} /> 🚨 Candidate Absent (No Face)
              </div>
            ) : !statusChecks.single_person ? (
              <div style={{
                position: 'absolute',
                bottom: '8px',
                right: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.92)',
                color: '#ffffff',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <Users size={14} /> 🚨 Multiple Faces Detected ({liveStats.face_count})
              </div>
            ) : statusChecks.identity_verified ? (
              <div style={{
                position: 'absolute',
                bottom: '8px',
                right: '8px',
                backgroundColor: 'rgba(16, 185, 129, 0.92)',
                color: '#ffffff',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <CheckCircle2 size={14} /> ✓ Biometric Match Verified ({verificationScore}%)
              </div>
            ) : verificationScore !== null ? (
              <div style={{
                position: 'absolute',
                bottom: '8px',
                right: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.92)',
                color: '#ffffff',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <XCircle size={14} /> 🚨 Identity Mismatch ({verificationScore}% &lt; 58%)
              </div>
            ) : null}
          </div>

          {/* Enrolled Candidate ID Profile Reference Comparison Card */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '0.75rem',
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            marginBottom: '1rem'
          }}>
            {capturedFaceReference ? (
              <img
                src={capturedFaceReference}
                alt="Enrolled Student Reference"
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '6px',
                  objectFit: 'cover',
                  border: '2px solid var(--accent-blue)'
                }}
              />
            ) : (
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '6px',
                backgroundColor: 'rgba(255,255,255,0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px dashed var(--border-color)'
              }}>
                <User size={24} color="#64748b" />
              </div>
            )}
            <div style={{ flex: 1, fontSize: '0.8rem' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Enrolled Profile Baseline
              </div>
              <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.9rem' }}>
                {currentUser?.name || 'Registered Student'}
              </div>
              <div style={{ color: 'var(--text-secondary)' }}>
                ID: {currentUser?.student_id || 'STU-PROCTOR'} · {currentUser?.email}
              </div>
              <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    fontSize: '0.7rem',
                    padding: '1px 6px',
                    borderRadius: '3px',
                    backgroundColor: statusChecks.identity_verified ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: statusChecks.identity_verified ? '#34d399' : '#f87171',
                    fontWeight: 600
                  }}>
                    {statusChecks.identity_verified ? `Match: ${verificationScore}%` : (verificationScore ? `Mismatch: ${verificationScore}%` : 'Awaiting Match')}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Threshold: ≥ 58%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={handleCalibrateFace}
                    disabled={calibrating || checking}
                    className="btn btn-secondary btn-sm"
                    style={{
                      fontSize: '0.7rem',
                      padding: '3px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      backgroundColor: 'rgba(59, 130, 246, 0.15)',
                      color: '#60a5fa',
                      border: '1px solid rgba(59, 130, 246, 0.3)'
                    }}
                    title="Capture current webcam frame as the official enrolled candidate face profile"
                  >
                    <Camera size={12} /> {calibrating ? 'Calibrating...' : 'Calibrate Profile Face'}
                  </button>
                  <span style={{
                    fontSize: '0.68rem',
                    color: '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}>
                    <Lock size={10} color="#64748b" /> Enrolled ID
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* AI Feedback Box */}
          {verificationFeedback && (
            <div style={{
              backgroundColor: allChecksPassed ? 'rgba(16, 185, 129, 0.12)' : (!statusChecks.identity_verified && verificationScore !== null ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)'),
              border: `1px solid ${allChecksPassed ? 'rgba(16, 185, 129, 0.3)' : (!statusChecks.identity_verified && verificationScore !== null ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)')}`,
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              fontSize: '0.825rem',
              color: allChecksPassed ? '#6ee7b7' : (!statusChecks.identity_verified && verificationScore !== null ? '#fca5a5' : '#fcd34d'),
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {allChecksPassed ? <CheckCircle2 size={16} /> : (!statusChecks.identity_verified && verificationScore !== null ? <XCircle size={16} /> : <AlertTriangle size={16} />)}
                <span>{verificationFeedback}</span>
              </div>
              {liveStats.brightness !== null && (
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', paddingLeft: '1.5rem' }}>
                  Brightness: <strong style={{ color: liveStats.brightness >= 30 ? '#6ee7b7' : '#f87171' }}>{liveStats.brightness}</strong>/255
                  &nbsp;·&nbsp; Faces detected: <strong style={{ color: liveStats.face_count === 1 ? '#6ee7b7' : '#f87171' }}>{liveStats.face_count}</strong>
                  {retryCount > 0 && <>&nbsp;·&nbsp; Auto-retry {retryCount}/3</>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: 5-Point Status Checklist & Consent */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Checklist Card */}
          <div className="glass-card">
            <h3 style={{ fontSize: '1.05rem', marginBottom: '1rem' }}>Mandatory Verification Status</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* 1. Camera */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.875rem' }}>
                  <Camera size={16} color="var(--accent-blue)" />
                  <span>Webcam Available & Active</span>
                </div>
                {statusChecks.camera_ready ? (
                  <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
                    <CheckCircle2 size={16} /> Ready
                  </span>
                ) : (
                  <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                    <XCircle size={16} /> Failed
                  </span>
                )}
              </div>

              {/* 2. Microphone */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.875rem' }}>
                  <Mic size={16} color="var(--accent-blue)" />
                  <span>Microphone Ready & Calibrated</span>
                </div>
                {statusChecks.microphone_ready ? (
                  <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
                    <CheckCircle2 size={16} /> Ready
                  </span>
                ) : (
                  <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                    <XCircle size={16} /> Failed
                  </span>
                )}
              </div>

              {/* 3. Lighting */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.875rem' }}>
                  <Sun size={16} color="var(--accent-blue)" />
                  <span>Ambient Lighting Sufficient</span>
                </div>
                {statusChecks.lighting_ok ? (
                  <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
                    <CheckCircle2 size={16} /> Passed
                  </span>
                ) : (
                  <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                    <XCircle size={16} /> Too Dim
                  </span>
                )}
              </div>

              {/* 4. Single Face Detected */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.875rem' }}>
                  <UserCheck size={16} color="var(--accent-blue)" />
                  <span>Single Candidate In View</span>
                </div>
                {statusChecks.face_detected && statusChecks.single_person ? (
                  <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
                    <CheckCircle2 size={16} /> Verified (1 Face)
                  </span>
                ) : (
                  <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                    <XCircle size={16} /> {!statusChecks.face_detected ? 'No Face' : 'Multiple Faces'}
                  </span>
                )}
              </div>

              {/* 5. Face Verification */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.875rem' }}>
                  <Lock size={16} color="var(--accent-blue)" />
                  <span>Biometric Identity Match</span>
                </div>
                {checking ? (
                  <span style={{ color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                    <RefreshCw size={14} className="animate-spin" /> Verifying...
                  </span>
                ) : statusChecks.identity_verified ? (
                  <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
                    <CheckCircle2 size={16} /> Matched ({verificationScore}%)
                  </span>
                ) : (
                  <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
                    <XCircle size={16} /> {verificationScore !== null ? `Mismatch (${verificationScore}%)` : 'Pending'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Privacy & Consent Notice */}
          <div className="glass-card" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <h4 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Lock size={15} color="var(--accent-blue)" /> Privacy & AI Proctoring Consent
            </h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', lineHeight: 1.4 }}>
              By starting this examination, you consent to automated video and audio monitoring. The AI system evaluates facial presence, gaze orientation, ambient noise, and unauthorized electronic devices. Flags generated by AI are review aids for human proctors and do not constitute definitive proof of misconduct.
            </p>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem' }}>
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
                style={{ marginTop: '3px' }}
              />
              <span>I confirm I am the enrolled student <strong>{currentUser?.name}</strong> and consent to AI proctoring rules for <strong>{exam?.title}</strong></span>
            </label>
          </div>

          {/* Start Exam Action Button */}
          <button
            onClick={handleStartExam}
            disabled={!allChecksPassed}
            className={`btn btn-lg ${allChecksPassed ? 'btn-primary' : 'btn-secondary'}`}
            style={{ width: '100%', opacity: allChecksPassed ? 1 : 0.6 }}
          >
            <span>Proceed to Examination</span> <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

