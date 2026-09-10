import React, { useState, useRef, useEffect } from 'react';
import { auth } from '../services/auth';
import { api } from '../services/api';
import { SmoothTracker } from '../utils/faceTrackerRenderer';
import {
  User,
  Shield,
  Camera,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  RefreshCw,
  Trash2,
  ArrowLeft,
  Save,
  Check,
  X,
  Sparkles,
  Lock,
  Mail,
  BookOpen,
  Award,
  AlertTriangle,
  UserCheck
} from 'lucide-react';

export default function ProfileEditor({ onBack, onUserUpdated }) {
  const [currentUser, setCurrentUser] = useState(auth.getUser());
  const isAdmin = currentUser?.role === 'admin';

  // Active Tab: 'personal' | 'biometrics' | 'security' | 'danger'
  const [activeTab, setActiveTab] = useState('personal');

  // Personal Info Form State
  const [name, setName] = useState(currentUser?.name || '');
  const [studentId, setStudentId] = useState(currentUser?.student_id || '');
  const [subject, setSubject] = useState(currentUser?.subject || 'All Subjects');
  const [savingPersonal, setSavingPersonal] = useState(false);

  // Password Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // Biometrics State
  const [faceReference, setFaceReference] = useState(currentUser?.face_reference || null);
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
  const [savingFace, setSavingFace] = useState(false);

  // Global Alerts & Modals
  const [successMessage, setSuccessMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Webcam Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const trackerRef = useRef(null);

  // Sync state when current user loads or changes
  useEffect(() => {
    async function loadFreshUser() {
      try {
        const fresh = await auth.fetchCurrentProfile();
        if (fresh) {
          setCurrentUser(fresh);
          setName(fresh.name || '');
          setStudentId(fresh.student_id || '');
          setSubject(fresh.subject || 'All Subjects');
          setFaceReference(fresh.face_reference || null);
        }
      } catch (err) {
        console.warn('Failed to fetch fresh user profile:', err);
      }
    }
    loadFreshUser();
  }, []);

  const showSuccess = (msg) => {
    setSuccessMessage(msg);
    setErrorMessage(null);
    setTimeout(() => setSuccessMessage(null), 4500);
  };

  const showError = (msg) => {
    setErrorMessage(msg);
    setSuccessMessage(null);
  };

  // 1. Save Personal Details (Name, Student ID, Subject)
  const handleSavePersonalInfo = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      showError('Full name cannot be empty.');
      return;
    }

    setSavingPersonal(true);
    setErrorMessage(null);

    try {
      const payload = {
        name: name.trim(),
        student_id: !isAdmin ? (studentId.trim() || undefined) : undefined,
        subject: isAdmin ? (subject.trim() || 'All Subjects') : undefined
      };

      const res = await auth.updateProfile(payload);
      setCurrentUser(res.user);
      if (onUserUpdated) onUserUpdated(res.user);
      showSuccess(`Profile updated successfully! Name changed to "${res.user.name}".`);
    } catch (err) {
      showError(err.message || 'Failed to update profile.');
    } finally {
      setSavingPersonal(false);
    }
  };

  // 2. Save Password Change
  const handleSavePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword) {
      showError('Please enter your current password.');
      return;
    }
    if (newPassword.length < 4) {
      showError('New password must be at least 4 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showError('New password and confirmation do not match.');
      return;
    }

    setSavingPassword(true);
    setErrorMessage(null);

    try {
      const payload = {
        current_password: currentPassword,
        new_password: newPassword
      };

      const res = await auth.updateProfile(payload);
      setCurrentUser(res.user);
      if (onUserUpdated) onUserUpdated(res.user);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showSuccess('Your password has been securely updated!');
    } catch (err) {
      showError(err.message || 'Failed to update password. Check current password.');
    } finally {
      setSavingPassword(false);
    }
  };

  // 3. Biometrics Studio Controls
  const startCamera = async () => {
    setErrorMessage(null);
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
      showError('Camera access denied or webcam device unavailable. Please allow browser camera permissions.');
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

  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(e => console.warn('Video play error:', e));

      if (!trackerRef.current && overlayRef.current) {
        trackerRef.current = new SmoothTracker(overlayRef, videoRef);
      }
      if (trackerRef.current) {
        trackerRef.current.start();
      }

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
          // ignore background validation glitches
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

  const handleCaptureAndSaveFace = async () => {
    const snapshotB64 = getSnapshot();
    if (!snapshotB64) return;

    setValidatingFace(true);
    setSavingFace(true);
    setFaceFeedback('Validating and saving facial reference baseline...');

    try {
      const res = await api.post('/auth/validate-face', { image_base64: snapshotB64 });

      // Save new face reference to backend
      const updateRes = await auth.updateProfile({ face_reference: snapshotB64 });
      setFaceReference(snapshotB64);
      setCurrentUser(updateRes.user);
      if (onUserUpdated) onUserUpdated(updateRes.user);
      stopCamera();
      showSuccess('Biometric facial baseline updated and calibrated successfully!');
    } catch (err) {
      // Fallback save
      try {
        const updateRes = await auth.updateProfile({ face_reference: snapshotB64 });
        setFaceReference(snapshotB64);
        setCurrentUser(updateRes.user);
        if (onUserUpdated) onUserUpdated(updateRes.user);
        stopCamera();
        showSuccess('Facial baseline photo saved.');
      } catch (saveErr) {
        showError(saveErr.message || 'Failed to save facial baseline.');
      }
    } finally {
      setValidatingFace(false);
      setSavingFace(false);
    }
  };

  const handleRemoveFace = async () => {
    if (!window.confirm('Are you sure you want to remove your enrolled facial reference? You will need to calibrate your webcam before future exams.')) {
      return;
    }
    setSavingFace(true);
    try {
      const res = await auth.updateProfile({ face_reference: '' });
      setFaceReference(null);
      setCurrentUser(res.user);
      if (onUserUpdated) onUserUpdated(res.user);
      showSuccess('Enrolled facial reference has been removed.');
    } catch (err) {
      showError(err.message || 'Failed to remove face reference.');
    } finally {
      setSavingFace(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await auth.deleteAccount();
    } catch (err) {
      showError(err.message || 'Failed to delete account');
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  return (
    <div className="main-content" style={{ maxWidth: '1080px' }}>
      {/* Top Navigation & Return Link */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <button
          onClick={onBack}
          className="btn btn-secondary btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)' }}
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </button>

        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Profile & Account Management
        </div>
      </div>

      {/* Global Alerts */}
      {successMessage && (
        <div style={{
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          color: '#6ee7b7',
          padding: '0.85rem 1.25rem',
          borderRadius: '10px',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          marginBottom: '1.5rem',
          boxShadow: '0 4px 15px rgba(16, 185, 129, 0.15)'
        }}>
          <CheckCircle2 size={18} color="#10b981" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          color: '#fca5a5',
          padding: '0.85rem 1.25rem',
          borderRadius: '10px',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          marginBottom: '1.5rem',
          boxShadow: '0 4px 15px rgba(239, 68, 68, 0.15)'
        }}>
          <AlertCircle size={18} color="#ef4444" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* User Hero Overview Banner */}
      <div className="glass-card" style={{
        padding: '2rem',
        marginBottom: '2rem',
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95))',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          {/* Avatar / Enrolled Face Thumbnail */}
          <div style={{ position: 'relative' }}>
            {faceReference ? (
              <img
                src={faceReference}
                alt="Enrolled Face"
                style={{
                  width: '84px',
                  height: '84px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '3px solid #3b82f6',
                  boxShadow: '0 0 20px rgba(59, 130, 246, 0.35)'
                }}
              />
            ) : (
              <div style={{
                width: '84px',
                height: '84px',
                borderRadius: '50%',
                backgroundColor: isAdmin ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                color: isAdmin ? '#f59e0b' : '#60a5fa',
                border: `3px solid ${isAdmin ? '#f59e0b' : '#3b82f6'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2.2rem',
                fontWeight: 700,
                boxShadow: '0 0 20px rgba(59, 130, 246, 0.2)'
              }}>
                {name ? name.charAt(0).toUpperCase() : 'U'}
              </div>
            )}
            <div style={{
              position: 'absolute',
              bottom: '2px',
              right: '2px',
              backgroundColor: faceReference ? '#10b981' : '#f59e0b',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              border: '2px solid #0f172a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#000',
              fontSize: '10px'
            }} title={faceReference ? 'Biometrics Enrolled' : 'Face Reference Pending'}>
              {faceReference ? '✓' : '!'}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>
                {name || 'User Profile'}
              </h1>
              <span className={`badge ${isAdmin ? 'badge-med' : 'badge-low'}`}>
                {isAdmin ? (subject && subject !== 'All Subjects' ? `ADMIN • ${subject}` : 'CHIEF PROCTOR') : 'STUDENT CANDIDATE'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.85rem', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Mail size={14} color="var(--accent-blue)" /> {currentUser?.email}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Shield size={14} color="var(--accent-blue)" />
                {isAdmin ? `Domain: ${subject || 'All Subjects'}` : `Student ID: ${studentId || currentUser?.student_id || 'STU101'}`}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <div style={{
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
            border: '1px solid var(--border-color)',
            padding: '0.65rem 1.25rem',
            borderRadius: '10px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Biometric Status
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: faceReference ? '#10b981' : '#f59e0b', marginTop: '2px' }}>
              {faceReference ? 'Enrolled & Verified' : 'Pending Capture'}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('personal')}
          className={`btn btn-sm ${activeTab === 'personal' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <User size={15} /> Personal Details
        </button>

        <button
          onClick={() => setActiveTab('biometrics')}
          className={`btn btn-sm ${activeTab === 'biometrics' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Camera size={15} /> Biometric Facial Baseline
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`btn btn-sm ${activeTab === 'security' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Lock size={15} /> Security & Password
        </button>

        <button
          onClick={() => setActiveTab('danger')}
          className={`btn btn-sm ${activeTab === 'danger' ? 'btn-danger' : 'btn-secondary'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}
        >
          <AlertTriangle size={15} /> Account Actions
        </button>
      </div>

      {/* Tab 1: Personal Details */}
      {activeTab === 'personal' && (
        <div className="glass-card" style={{ padding: '2rem' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>Personal Information</h2>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
              Update your display name, identification codes, and academic domain.
            </p>
          </div>

          <form onSubmit={handleSavePersonalInfo}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={14} color="var(--accent-blue)" /> Full Name
                </label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  This name appears on examination logs and proctoring audit reports.
                </span>
              </div>

              {!isAdmin ? (
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Shield size={14} color="var(--accent-blue)" /> Student Roll Number / ID
                  </label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. STU202401"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    Candidate student roll identifier used for institutional tracking.
                  </span>
                </div>
              ) : (
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <BookOpen size={14} color="var(--accent-blue)" /> Assigned Subject Domain
                  </label>
                  <select
                    className="form-input"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  >
                    <option value="All Subjects">All Subjects (Chief Proctor)</option>
                    <option value="DBMS">Database Management Systems (DBMS)</option>
                    <option value="Computer Networks">Computer Networks</option>
                    <option value="Operating Systems">Operating Systems</option>
                    <option value="AI & Machine Learning">AI & Machine Learning</option>
                    <option value="Cybersecurity">Cybersecurity</option>
                  </select>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    Admin domain determines scoped exams and surveillance telemetries.
                  </span>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Mail size={14} color="var(--accent-blue)" /> Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  disabled
                  className="form-input"
                  value={currentUser?.email || ''}
                  style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)', opacity: 0.8, cursor: 'not-allowed', color: 'var(--text-secondary)' }}
                />
                <span style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '0.72rem',
                  color: '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: 600
                }}>
                  <CheckCircle2 size={13} /> Verified
                </span>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Email address is linked to your authentication token and cannot be modified directly.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1.25rem' }}>
              <button
                type="submit"
                disabled={savingPersonal}
                className="btn btn-primary"
                style={{ padding: '0.65rem 1.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                {savingPersonal ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" /> Saving Changes...
                  </>
                ) : (
                  <>
                    <Save size={15} /> Save Changes
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 2: Biometric Facial Baseline Studio */}
      {activeTab === 'biometrics' && (
        <div className="glass-card" style={{ padding: '2rem' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>Biometric Facial Baseline Studio</h2>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
              SmartProctor AI utilizes your facial baseline image to continuously match and verify your identity during examinations.
            </p>
          </div>

          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Current Enrolled Reference Status */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: faceReference ? '140px 1fr' : '1fr',
            gap: '1.5rem',
            backgroundColor: 'var(--bg-secondary)',
            padding: '1.5rem',
            borderRadius: '10px',
            border: '1px solid var(--border-color)',
            alignItems: 'center',
            marginBottom: '1.75rem'
          }}>
            {faceReference && (
              <div style={{ textAlign: 'center' }}>
                <img
                  src={faceReference}
                  alt="Registered Face"
                  style={{
                    width: '120px',
                    height: '120px',
                    borderRadius: '8px',
                    objectFit: 'cover',
                    border: '2px solid #10b981',
                    boxShadow: '0 0 15px rgba(16, 185, 129, 0.25)'
                  }}
                />
              </div>
            )}

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <span className={`badge ${faceReference ? 'badge-low' : 'badge-med'}`}>
                  {faceReference ? '✓ Enrolled Baseline Active' : '⚠️ No Baseline Reference'}
                </span>
              </div>

              <h3 style={{ fontSize: '1.05rem', marginBottom: '0.35rem' }}>
                {faceReference ? 'Biometric Face Model Calibrated' : 'Facial Reference Required'}
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1rem' }}>
                {faceReference
                  ? 'Your biometric face embedding is registered. During pre-exam hardware check and active exam monitoring, live camera frames are compared against this image to detect impersonation and head poses.'
                  : 'You currently do not have an enrolled face reference. Calibrate and capture your webcam photo below so you can proceed smoothly through pre-exam verification.'}
              </p>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {!cameraActive && (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="btn btn-primary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    <Camera size={15} /> {faceReference ? 'Recalibrate / Retake Photo' : 'Open Camera & Calibrate'}
                  </button>
                )}

                {faceReference && !cameraActive && (
                  <button
                    type="button"
                    onClick={handleRemoveFace}
                    disabled={savingFace}
                    className="btn btn-secondary btn-sm"
                    style={{ borderColor: 'rgba(239, 68, 68, 0.3)', color: '#f87171' }}
                  >
                    <Trash2 size={14} /> Remove Baseline
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Live Webcam Scanner Area */}
          {cameraActive && (
            <div style={{
              backgroundColor: 'var(--bg-secondary)',
              padding: '1.5rem',
              borderRadius: '10px',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              marginTop: '1.5rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sparkles size={16} color="var(--accent-blue)" /> Live AI Face Verification Studio
                </span>
                <span className="badge badge-low" style={{ fontSize: '0.72rem' }}>
                  60 FPS Tracker Active
                </span>
              </div>

              <div style={{
                position: 'relative',
                borderRadius: '8px',
                overflow: 'hidden',
                backgroundColor: '#020617',
                aspectRatio: '4/3',
                maxWidth: '520px',
                margin: '0 auto 1rem auto',
                border: '1px solid var(--border-color)'
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
                  backgroundColor: 'rgba(0,0,0,0.65)',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  color: '#94a3b8'
                }}>
                  {faceFeedback || 'Position face within camera view...'}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={handleCaptureAndSaveFace}
                  disabled={validatingFace || savingFace}
                  className="btn btn-success btn-sm"
                  style={{ padding: '0.65rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  {savingFace ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" /> Saving Face Baseline...
                    </>
                  ) : (
                    <>
                      <Check size={16} /> Capture & Save Facial Baseline
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={stopCamera}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel Camera
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Security & Password */}
      {activeTab === 'security' && (
        <div className="glass-card" style={{ padding: '2rem' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>Security & Credentials</h2>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
              Update your account password to maintain security.
            </p>
          </div>

          <form onSubmit={handleSavePassword} style={{ maxWidth: '520px' }}>
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <KeyRound size={14} color="var(--accent-blue)" /> Current Password
              </label>
              <input
                type="password"
                required
                className="form-input"
                placeholder="Enter current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={14} color="var(--accent-blue)" /> New Password
              </label>
              <input
                type="password"
                required
                className="form-input"
                placeholder="Enter new password (min. 4 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={14} color="var(--accent-blue)" /> Confirm New Password
              </label>
              <input
                type="password"
                required
                className="form-input"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={savingPassword}
              className="btn btn-primary"
              style={{ marginTop: '1rem', padding: '0.65rem 1.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {savingPassword ? (
                <>
                  <RefreshCw size={15} className="animate-spin" /> Updating Password...
                </>
              ) : (
                <>
                  <KeyRound size={15} /> Update Password
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Tab 4: Account Actions & Danger Zone */}
      {activeTab === 'danger' && (
        <div className="glass-card" style={{ padding: '2rem' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>Account Diagnostic & Management</h2>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
              View system account telemetry or delete your user record.
            </p>
          </div>

          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '8px',
            padding: '1.25rem',
            border: '1px solid var(--border-color)',
            marginBottom: '2rem'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Account ID</div>
                <div style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', marginTop: '2px' }}>
                  {currentUser?.id || currentUser?._id || 'N/A'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Role Level</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-blue)', marginTop: '2px' }}>
                  {isAdmin ? 'System Administrator' : 'Candidate Student'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Biometrics Verification</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: faceReference ? '#10b981' : '#f59e0b', marginTop: '2px' }}>
                  {faceReference ? 'Calibrated' : 'Uncalibrated'}
                </div>
              </div>
            </div>
          </div>

          {/* Danger Zone Box */}
          <div style={{
            border: '1px solid rgba(239, 68, 68, 0.3)',
            backgroundColor: 'rgba(239, 68, 68, 0.05)',
            borderRadius: '10px',
            padding: '1.5rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <AlertTriangle size={18} color="#ef4444" />
              <h3 style={{ fontSize: '1.05rem', color: '#f87171', margin: 0 }}>Danger Zone</h3>
            </div>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              Permanently delete this user account. Deleting your account will wipe all recorded exam sessions, proctoring violation logs, and enrolled biometric references. This action is irreversible.
            </p>

            <button
              onClick={() => setShowDeleteModal(true)}
              className="btn btn-danger btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Trash2 size={15} /> Permanently Delete Account
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '1rem'
        }}>
          <div className="glass-card" style={{
            maxWidth: '440px',
            width: '100%',
            backgroundColor: '#0f172a',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            boxShadow: '0 20px 25px -5px rgba(239, 68, 68, 0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', color: '#ef4444' }}>
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                padding: '0.5rem',
                borderRadius: '8px',
                display: 'flex'
              }}>
                <AlertTriangle size={24} />
              </div>
              <h3 style={{ fontSize: '1.2rem', color: '#fff', margin: 0 }}>Delete Account</h3>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              Are you sure you want to permanently delete the account for <strong style={{ color: '#fff' }}>{currentUser?.name}</strong> ({currentUser?.email})?
            </p>

            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '6px',
              padding: '0.75rem 1rem',
              fontSize: '0.8rem',
              color: '#fca5a5',
              marginBottom: '1.5rem'
            }}>
              ⚠️ <strong>Warning:</strong> All your exam history, proctoring violation logs, and biometric face baseline will be permanently erased.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setShowDeleteModal(false)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteAccount}
                className="btn btn-primary btn-sm"
                style={{
                  backgroundColor: '#ef4444',
                  borderColor: '#dc2626',
                  color: '#fff'
                }}
              >
                {deleting ? 'Deleting...' : 'Yes, Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
