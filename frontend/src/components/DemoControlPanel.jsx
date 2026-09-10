import React, { useState } from 'react';
import { api } from '../services/api';
import { Smartphone, Users, EyeOff, Mic, UserX, Sparkles, CheckCircle2 } from 'lucide-react';

export default function DemoControlPanel({ attemptId, onEventTriggered }) {
  const [loading, setLoading] = useState(false);
  const [lastTriggered, setLastTriggered] = useState(null);

  const simulate = async (eventType, label) => {
    if (!attemptId || loading) return;
    setLoading(true);
    try {
      const res = await api.post('/demo/simulate', {
        attempt_id: attemptId,
        event_type: eventType,
        confidence: 0.94
      });
      setLastTriggered(`${label} (+${res.points_added} pts)`);
      if (onEventTriggered) {
        onEventTriggered(res);
      }
      setTimeout(() => setLastTriggered(null), 4000);
    } catch (err) {
      console.error('Demo simulation error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      border: '1px solid rgba(59, 130, 246, 0.4)',
      borderRadius: '10px',
      padding: '0.75rem 1.25rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1rem',
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      backdropFilter: 'blur(8px)',
      marginTop: '1rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <div style={{
          backgroundColor: 'rgba(59, 130, 246, 0.2)',
          padding: '0.35rem',
          borderRadius: '6px',
          color: 'var(--accent-blue)',
          display: 'flex'
        }}>
          <Sparkles size={18} />
        </div>
        <div>
          <div style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--accent-blue)' }}>
            COLLEGE VIVA & DEMO SIMULATION PANEL
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            One-click triggers to demonstrate AI anomaly detection and scoring for viva evaluators
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => simulate('MOBILE_PHONE_DETECTED', 'Phone Detected')}
          disabled={loading}
          className="btn btn-sm btn-secondary"
          style={{ fontSize: '0.75rem', borderColor: 'rgba(239, 68, 68, 0.5)' }}
        >
          <Smartphone size={13} color="#ef4444" /> Phone (+50)
        </button>

        <button
          onClick={() => simulate('MULTIPLE_PERSONS_DETECTED', 'Multiple Persons')}
          disabled={loading}
          className="btn btn-sm btn-secondary"
          style={{ fontSize: '0.75rem', borderColor: 'rgba(239, 68, 68, 0.5)' }}
        >
          <Users size={13} color="#ef4444" /> Multi-Person (+40)
        </button>

        <button
          onClick={() => simulate('SUSPICIOUS_HEAD_MOVEMENT', 'Looking Away')}
          disabled={loading}
          className="btn btn-sm btn-secondary"
          style={{ fontSize: '0.75rem', borderColor: 'rgba(245, 158, 11, 0.5)' }}
        >
          <EyeOff size={13} color="#f59e0b" /> Looking Away (+10)
        </button>

        <button
          onClick={() => simulate('FACE_NOT_DETECTED', 'Face Missing')}
          disabled={loading}
          className="btn btn-sm btn-secondary"
          style={{ fontSize: '0.75rem', borderColor: 'rgba(245, 158, 11, 0.5)' }}
        >
          <UserX size={13} color="#f59e0b" /> Face Missing (+20)
        </button>

        <button
          onClick={() => simulate('AUDIO_ACTIVITY_DETECTED', 'Audio Activity')}
          disabled={loading}
          className="btn btn-sm btn-secondary"
          style={{ fontSize: '0.75rem', borderColor: 'rgba(245, 158, 11, 0.5)' }}
        >
          <Mic size={13} color="#f59e0b" /> Talking/Audio (+20)
        </button>
      </div>

      {lastTriggered && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: '#6ee7b7',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          padding: '0.3rem 0.6rem',
          borderRadius: '6px'
        }}>
          <CheckCircle2 size={14} />
          <span>{lastTriggered}</span>
        </div>
      )}
    </div>
  );
}
