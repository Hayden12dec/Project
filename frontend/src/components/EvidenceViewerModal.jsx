import React from 'react';
import { X, Calendar, ShieldAlert, Award, FileImage } from 'lucide-react';
import RiskBadge from './RiskBadge';

export default function EvidenceViewerModal({ evidence, onClose }) {
  if (!evidence) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '1.5rem'
    }}>
      <div className="glass-card" style={{
        maxWidth: '850px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        position: 'relative',
        padding: '1.5rem',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid #475569'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <FileImage size={20} color="var(--accent-blue)" />
            <h3 style={{ fontSize: '1.15rem' }}>Proctoring Incident Evidence Capture</h3>
          </div>
          <button
            onClick={onClose}
            className="btn btn-secondary btn-sm"
            style={{ padding: '0.35rem' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Image Preview */}
        <div style={{
          backgroundColor: '#000000',
          borderRadius: '8px',
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          maxHeight: '480px',
          marginBottom: '1rem',
          border: '1px solid var(--border-color)'
        }}>
          <img
            src={evidence.image_url || evidence.evidence_image}
            alt="Proctoring Evidence"
            style={{ width: '100%', maxHeight: '480px', objectFit: 'contain' }}
          />
        </div>

        {/* Metadata Details */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem',
          backgroundColor: 'var(--bg-primary)',
          padding: '1rem',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle)'
        }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Flagged Anomaly</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fca5a5' }}>
              {(evidence.event_type || 'INCIDENT').replace(/_/g, ' ')}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Suspicion Points</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f59e0b' }}>
              +{evidence.points || evidence.suspicion_points || 0} pts
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>AI Detection Confidence</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
              {Math.round((evidence.confidence || 0.9) * 100)}%
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Timestamp (UTC)</div>
            <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
              {evidence.timestamp ? new Date(evidence.timestamp).toLocaleTimeString() : 'N/A'}
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Captured automatically by AI Proctoring Engine with bounding box localization.
          </span>
          <button onClick={onClose} className="btn btn-primary btn-sm">
            Close Evidence Viewer
          </button>
        </div>
      </div>
    </div>
  );
}
