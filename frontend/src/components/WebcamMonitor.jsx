import React, { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { AudioMonitor } from '../services/audioService';
import { SmoothTracker } from '../utils/faceTrackerRenderer';
import RiskBadge from './RiskBadge';
import { Camera, Volume2, Eye, ShieldAlert, CheckCircle, Smartphone, AlertTriangle, ChevronDown, ChevronUp, Cpu, User, UserX, Users } from 'lucide-react';

export default function WebcamMonitor({ attemptId, isPaused = false, onSuspicionChange, onAlert }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const trackerRef = useRef(null);
  const audioMonitorRef = useRef(null);
  const isAnalyzingRef = useRef(false);

  const [streamActive, setStreamActive] = useState(false);
  const [telemetry, setTelemetry] = useState({
    suspicion_score: 0,
    risk_level: 'LOW',
    head_pose: { direction: 'FORWARD', yaw: 0, pitch: 0, is_suspicious: false },
    person_count: 1,
    face_detected: true,
    presence_status: 'NORMAL',
    detections: [],
    phone_status: 'NOT_DETECTED',
    phone_confirmed: false,
    phone_confidence: 0.0,
    triggered_events: [],
    debug_telemetry: null
  });
  const [micEnergy, setMicEnergy] = useState(0.0);
  const [recentAlert, setRecentAlert] = useState(null);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    let intervalId = null;
    let localStream = null;

    async function initStream() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false
        });
        localStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          await videoRef.current.play();
          setStreamActive(true);
        }

        // Start Smooth 60FPS Face & Object Tracking Loop
        if (!trackerRef.current && overlayRef.current) {
          trackerRef.current = new SmoothTracker(overlayRef, videoRef);
        }
        if (trackerRef.current) {
          trackerRef.current.start();
        }

        // Initialize Audio Monitor
        const audioMon = new AudioMonitor((energy) => {
          setMicEnergy(energy);
        });
        await audioMon.start();
        audioMonitorRef.current = audioMon;

        // Interval to send frame analysis to backend (120ms for instant real-time response)
        intervalId = setInterval(captureAndAnalyze, 120);
      } catch (err) {
        console.warn('Webcam stream permission denied or unavailable:', err);
      }
    }

    initStream();

    return () => {
      if (trackerRef.current) trackerRef.current.stop();
      if (intervalId) clearInterval(intervalId);
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (audioMonitorRef.current) {
        audioMonitorRef.current.stop();
      }
    };
  }, [attemptId]);

  const captureAndAnalyze = async () => {
    if (isPaused || isAnalyzingRef.current || !videoRef.current || !canvasRef.current || !attemptId) return;

    isAnalyzingRef.current = true;
    try {
      const video = videoRef.current;
      if (video.readyState < 2 || !video.videoWidth) {
        isAnalyzingRef.current = false;
        return;
      }

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      // Fast 480x360 frame extraction for low-latency AI detection & biometric tracking
      canvas.width = 480;
      canvas.height = 360;
      
      ctx.drawImage(video, 0, 0, 480, 360);
      const base64Image = canvas.toDataURL('image/jpeg', 0.65);

      const currentAudio = audioMonitorRef.current ? audioMonitorRef.current.getEnergyLevel() : 0.0;
      setMicEnergy(currentAudio);

      const res = await api.post('/proctoring/frame', {
        attempt_id: attemptId,
        image_base64: base64Image,
        audio_energy: currentAudio
      });

      if (res.status === 'success') {
        setTelemetry(res);

        // Smooth 60FPS Tracking Update
        if (trackerRef.current) {
          const vw = video.videoWidth || 640;
          const vh = video.videoHeight || 480;
          const fw = res.frame_size?.[0] || 384;
          const fh = res.frame_size?.[1] || 288;
          const scaleX = vw / fw;
          const scaleY = vh / fh;

          const faces = (res.detections || [])
            .filter(d => !d.is_phone && (!d.label || !d.label.toLowerCase().includes('phone')))
            .map(f => {
              const scaledContours = {};
              if (f.contours) {
                Object.keys(f.contours).forEach(k => {
                  scaledContours[k] = (f.contours[k] || []).map(([cx, cy]) => [cx * scaleX, cy * scaleY]);
                });
              }
              return {
                ...f,
                bbox: [f.bbox[0] * scaleX, f.bbox[1] * scaleY, f.bbox[2] * scaleX, f.bbox[3] * scaleY],
                landmarks: (f.landmarks || []).map(([lx, ly]) => [lx * scaleX, ly * scaleY]),
                contours: scaledContours
              };
            });

          const phones = (res.detections || [])
            .filter(d => d.is_phone || (d.label && d.label.toLowerCase().includes('phone')))
            .map(p => ({
              ...p,
              bbox: [p.bbox[0] * scaleX, p.bbox[1] * scaleY, p.bbox[2] * scaleX, p.bbox[3] * scaleY]
            }));

          const isAbsent = res.presence_status === 'STUDENT_ABSENT' || !res.face_detected || faces.length === 0;
          const hasImpersonation = (res.triggered_events || []).some(
            e => e.type === 'IMPERSONATION_DETECTED' || e.event_type === 'IMPERSONATION_DETECTED'
          );

          let statusTag = '✓ FACE TRACED';
          if (isAbsent) {
            statusTag = '🚨 STUDENT ABSENT';
          } else if (hasImpersonation) {
            statusTag = '🚨 IMPERSONATION DETECTED';
          } else if (res.head_pose?.direction && res.head_pose.direction !== 'FORWARD') {
            statusTag = `⚠ ${res.head_pose.direction.replace('_', ' ')}`;
          }

          trackerRef.current.updateDetections(faces, phones, {
            isVerified: !isAbsent && !hasImpersonation,
            score: isAbsent ? 0 : (hasImpersonation ? 38 : 95),
            statusTag,
            headPose: res.head_pose
          });
        }

        if (onSuspicionChange) {
          onSuspicionChange(res.suspicion_score, res.risk_level);
        }

        if (res.triggered_events && res.triggered_events.length > 0) {
          const latest = res.triggered_events[0];
          setRecentAlert(latest);
          if (onAlert) onAlert(latest);
        } else if (res.phone_status === 'NOT_DETECTED' && recentAlert === 'MOBILE_PHONE_DETECTED') {
          setRecentAlert(null);
        }
      }
    } catch (err) {
      console.debug('Proctoring frame send error:', err);
    } finally {
      isAnalyzingRef.current = false;
    }
  };

  const getGazeLabel = () => {
    const dir = telemetry.head_pose?.direction || 'FORWARD';
    if (dir === 'LOOKING_RIGHT') return 'Looking Right';
    if (dir === 'LOOKING_LEFT') return 'Looking Left';
    if (dir === 'LOOKING_DOWN') return 'Looking Down';
    if (dir === 'LOOKING_UP') return 'Looking Up';
    return 'Screen (Forward)';
  };

  const isHeadSuspicious = telemetry.head_pose?.is_suspicious || (telemetry.head_pose?.direction && telemetry.head_pose.direction !== 'FORWARD');
  const isPhoneDetected = telemetry.phone_status === 'DETECTED' || telemetry.phone_confirmed;
  const isAbsent = telemetry.presence_status === 'STUDENT_ABSENT' || (!telemetry.face_detected && telemetry.person_count === 0);
  const isMultiPerson = telemetry.person_count > 1 || telemetry.presence_status === 'MULTIPLE_PERSONS_DETECTED';

  return (
    <div className="glass-card" style={{ padding: '0.85rem', width: '310px', position: 'relative', overflow: 'hidden' }}>
      {/* Hidden Canvas for snapshot extraction */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600 }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: streamActive ? '#10b981' : '#ef4444',
            boxShadow: streamActive ? '0 0 8px #10b981' : 'none'
          }} />
          <span>AI Proctoring: <strong style={{ color: streamActive ? '#10b981' : '#ef4444' }}>ACTIVE</strong></span>
        </div>
        <RiskBadge score={telemetry.suspicion_score} level={telemetry.risk_level} showScore={false} />
      </div>

      {/* Video Container with Visual Bounding Box Overlay */}
      <div style={{
        position: 'relative',
        borderRadius: '8px',
        overflow: 'hidden',
        backgroundColor: '#020617',
        aspectRatio: '4/3',
        border: `2px solid ${isPhoneDetected || isAbsent || isMultiPerson ? '#ef4444' : (isHeadSuspicious ? '#f59e0b' : 'var(--border-color)')}`,
        boxShadow: isPhoneDetected ? '0 0 15px rgba(239, 68, 68, 0.4)' : 'none'
      }}>
        <video
          ref={videoRef}
          muted
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
        />

        {/* Live Detection Overlay Canvas */}
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

        {/* Video Overlay Info Bar */}
        <div style={{
          position: 'absolute',
          bottom: '6px',
          left: '6px',
          right: '6px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.7)',
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '0.72rem',
          backdropFilter: 'blur(4px)',
          zIndex: 2
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: isHeadSuspicious ? '#fcd34d' : '#94a3b8' }}>
            <Eye size={12} color={isHeadSuspicious ? '#f59e0b' : 'var(--accent-blue)'} />
            <span>{getGazeLabel()}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: micEnergy > 0.03 ? '#f87171' : '#94a3b8' }}>
            <Volume2 size={12} color={micEnergy > 0.03 ? '#ef4444' : '#10b981'} />
            <span>{Math.round(micEnergy * 100)}%</span>
          </div>
        </div>

        {/* Floating Phone Detection Warning */}
        {isPhoneDetected && (
          <div style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            right: '8px',
            backgroundColor: 'rgba(220, 38, 38, 0.92)',
            color: '#ffffff',
            padding: '5px 8px',
            borderRadius: '4px',
            fontSize: '0.72rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            boxShadow: '0 0 12px rgba(220,38,38,0.6)',
            zIndex: 3
          }}>
            <Smartphone size={14} />
            <span>⚠ MOBILE PHONE DETECTED ({Math.round(telemetry.phone_confidence * 100)}%)</span>
          </div>
        )}

        {/* Absence Warning */}
        {isAbsent && !isPhoneDetected && (
          <div style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            right: '8px',
            backgroundColor: 'rgba(220, 38, 38, 0.92)',
            color: '#ffffff',
            padding: '5px 8px',
            borderRadius: '4px',
            fontSize: '0.72rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            zIndex: 3
          }}>
            <UserX size={14} />
            <span>⚠ CANDIDATE ABSENT / NO FACE</span>
          </div>
        )}
      </div>

      {/* Structured AI Proctoring Status Panel */}
      <div style={{
        backgroundColor: 'var(--bg-secondary)',
        padding: '0.65rem 0.75rem',
        borderRadius: '6px',
        marginTop: '0.6rem',
        border: '1px solid var(--border-subtle)',
        fontSize: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem'
      }}>
        {/* 1. Face Presence */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)' }}>Face Detection:</span>
          {isAbsent ? (
            <span style={{ color: '#ef4444', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
              ⚠ Not Detected
            </span>
          ) : isMultiPerson ? (
            <span style={{ color: '#ef4444', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
              ⚠ Multiple ({telemetry.person_count})
            </span>
          ) : (
            <span style={{ color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
              ✓ 1 Face In View
            </span>
          )}
        </div>

        {/* 2. Head Movement / Gaze */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)' }}>Head / Gaze:</span>
          <span style={{ color: isHeadSuspicious ? '#f59e0b' : '#10b981', fontWeight: 600 }}>
            {isHeadSuspicious ? `⚠ ${getGazeLabel()}` : '✓ Forward'}
          </span>
        </div>

        {/* 3. Person Count */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)' }}>Person Count:</span>
          <span style={{
            fontWeight: 700,
            color: (telemetry.person_count === 1) ? '#10b981' : '#ef4444'
          }}>
            {telemetry.person_count ?? (telemetry.face_detected ? 1 : 0)}
          </span>
        </div>

        {/* 4. Mobile Phone Status */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid var(--border-subtle)',
          paddingTop: '0.35rem'
        }}>
          <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Mobile Phone:</span>
          <span style={{
            color: isPhoneDetected ? '#ef4444' : '#10b981',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '3px'
          }}>
            {isPhoneDetected ? `⚠ DETECTED (${Math.round(telemetry.phone_confidence * 100)}%)` : '✓ Not Detected'}
          </span>
        </div>

        {/* 5. Audio Activity */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ color: 'var(--text-muted)' }}>Audio Activity:</span>
          <span style={{
            color: micEnergy > 0.03 ? '#ef4444' : '#10b981',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '3px'
          }}>
            {micEnergy > 0.03 ? '⚠ Talking / Noise' : '✓ Normal'}
          </span>
        </div>
      </div>

      {/* Score & Risk Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginTop: '0.5rem' }}>
        <div style={{
          backgroundColor: 'var(--bg-secondary)',
          padding: '0.4rem',
          borderRadius: '6px',
          textAlign: 'center',
          border: '1px solid var(--border-subtle)'
        }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Suspicion Score</div>
          <div style={{
            fontSize: '1rem',
            fontWeight: 700,
            fontFamily: 'var(--font-heading)',
            color: telemetry.suspicion_score >= 60 ? '#ef4444' : (telemetry.suspicion_score >= 30 ? '#f59e0b' : '#10b981')
          }}>
            {telemetry.suspicion_score} pts
          </div>
        </div>

        <div style={{
          backgroundColor: 'var(--bg-secondary)',
          padding: '0.4rem',
          borderRadius: '6px',
          textAlign: 'center',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Status</div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: telemetry.risk_level === 'HIGH' ? '#ef4444' : (telemetry.risk_level === 'MEDIUM' ? '#f59e0b' : '#10b981') }}>
            {telemetry.risk_level} RISK
          </div>
        </div>
      </div>

      {/* Temporary Alert Toast */}
      {recentAlert && (
        <div style={{
          marginTop: '0.5rem',
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: '6px',
          padding: '0.4rem 0.6rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          fontSize: '0.72rem',
          color: '#fca5a5'
        }}>
          <ShieldAlert size={14} style={{ flexShrink: 0 }} />
          <span style={{ fontWeight: 600 }}>FLAGGED: {recentAlert.replace(/_/g, ' ')}</span>
        </div>
      )}

      {/* Debug Mode Collapsible Toggle */}
      {telemetry.debug_telemetry && (
        <div style={{ marginTop: '0.5rem' }}>
          <button
            onClick={() => setShowDebug(!showDebug)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '0.68rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '2px 0'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Cpu size={12} color="var(--accent-blue)" /> AI Model Diagnostics
            </span>
            {showDebug ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>

          {showDebug && (
            <div style={{
              backgroundColor: '#0a0f1d',
              border: '1px solid #1e293b',
              borderRadius: '4px',
              padding: '0.5rem',
              fontSize: '0.65rem',
              fontFamily: 'var(--font-mono)',
              marginTop: '4px',
              color: '#94a3b8'
            }}>
              <div><strong>Model:</strong> {telemetry.debug_telemetry.model_name}</div>
              <div><strong>Threshold:</strong> {telemetry.debug_telemetry.threshold}</div>
              <div><strong>FPS:</strong> {telemetry.debug_telemetry.fps} ({telemetry.debug_telemetry.inference_time_ms}ms)</div>
              <div><strong>Detections:</strong> {telemetry.debug_telemetry.total_detections}</div>
              {telemetry.debug_telemetry.detected_classes?.length > 0 && (
                <div><strong>Classes:</strong> {telemetry.debug_telemetry.detected_classes.join(', ')}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
