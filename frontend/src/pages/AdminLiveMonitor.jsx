import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import RiskBadge from '../components/RiskBadge';
import {
  MonitorPlay,
  ShieldAlert,
  AlertTriangle,
  Send,
  Eye,
  RefreshCw,
  Clock,
  User,
  CheckCircle,
  MessageSquareWarning
} from 'lucide-react';

export default function AdminLiveMonitor({ onSelectReport }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [warningSent, setWarningSent] = useState({});

  const fetchSessions = async () => {
    try {
      const res = await api.get('/admin/sessions');
      setSessions(res || []);
    } catch (err) {
      console.error('Failed to load active sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 2500); // 2.5s polling for live stream
    return () => clearInterval(interval);
  }, []);

  const handleSendWarning = (sessionId, studentName) => {
    setWarningSent(prev => ({ ...prev, [sessionId]: true }));
    setTimeout(() => {
      setWarningSent(prev => ({ ...prev, [sessionId]: false }));
    }, 4000);
  };

  return (
    <div className="main-content">
      {/* Top Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444', animation: 'pulse-subtle 1.5s infinite' }} />
            <h1 style={{ fontSize: '1.85rem' }}>Live Examination Surveillance Room</h1>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Real-time multi-candidate feed monitoring with automated AI anomaly alerts
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Active Candidates: <strong>{sessions.length}</strong>
          </span>
          <button onClick={fetchSessions} className="btn btn-secondary btn-sm">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Stream
          </button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
          <MonitorPlay size={40} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
          <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>No Active Examination Sessions</h3>
          <p style={{ fontSize: '0.85rem' }}>
            Candidate live feeds will appear here automatically when students begin an exam.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.5rem' }}>
          {sessions.map(s => {
            const hasSent = warningSent[s.id];
            return (
              <div
                key={s.id}
                className="glass-card"
                style={{
                  padding: '1rem',
                  borderColor: s.risk_level === 'HIGH' ? '#ef4444' : (s.risk_level === 'MEDIUM' ? '#f59e0b' : 'var(--border-color)')
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '1rem' }}>{s.student_name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {s.student_code || 'STU101'} • {s.exam_title}
                    </div>
                  </div>
                  <RiskBadge score={s.suspicion_score || 0} level={s.risk_level} />
                </div>

                {/* Webcam Preview / Snapshot */}
                <div style={{
                  position: 'relative',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  backgroundColor: '#020617',
                  aspectRatio: '4/3',
                  marginBottom: '0.75rem',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {s.live_preview ? (
                    <img
                      src={s.live_preview}
                      alt="Candidate Feed"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      <User size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                      <span>Feed connecting...</span>
                    </div>
                  )}

                  {/* Latest Event Pill */}
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    backgroundColor: s.phone_detected || s.latest_event === 'MOBILE_PHONE_DETECTED' ? 'rgba(220, 38, 38, 0.95)' : 'rgba(0,0,0,0.75)',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: s.phone_detected ? 700 : 500,
                    backdropFilter: 'blur(4px)',
                    color: s.phone_detected || s.latest_event === 'MOBILE_PHONE_DETECTED' ? '#ffffff' : (s.latest_event === 'NORMAL' ? '#6ee7b7' : '#fca5a5'),
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: s.phone_detected ? '0 0 10px rgba(220,38,38,0.6)' : 'none'
                  }}>
                    <span style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: s.latest_event === 'NORMAL' ? '#10b981' : '#ef4444',
                      animation: s.phone_detected ? 'pulse-subtle 1s infinite' : 'none'
                    }} />
                    <span>
                      {s.phone_detected ? (
                        `⚠ MOBILE PHONE (${Math.round((s.phone_confidence || 0.88) * 100)}%)`
                      ) : (
                        (s.latest_event || 'NORMAL').replace(/_/g, ' ')
                      )}
                    </span>
                  </div>
                </div>

                {/* Live Stats */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.5rem',
                  backgroundColor: 'var(--bg-secondary)',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  marginBottom: '0.75rem'
                }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Suspicion Points:</span>{' '}
                    <strong style={{ color: s.suspicion_score >= 60 ? '#ef4444' : (s.suspicion_score >= 30 ? '#f59e0b' : '#10b981') }}>
                      {s.suspicion_score || 0}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Events Logged:</span>{' '}
                    <strong>{s.total_events || 0}</strong>
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => handleSendWarning(s.id, s.student_name)}
                    disabled={hasSent}
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1, fontSize: '0.75rem' }}
                  >
                    <MessageSquareWarning size={13} color="#f59e0b" />
                    {hasSent ? 'Warning Dispatched' : 'Issue Warning'}
                  </button>

                  <button
                    onClick={() => onSelectReport(s.id)}
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                  >
                    <Eye size={13} /> Inspect
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
