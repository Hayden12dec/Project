import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import RiskBadge from '../components/RiskBadge';
import { Award, CheckCircle2, XCircle, Clock, Shield, ArrowRight, LayoutDashboard, FileText } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function ExamResultPage({ attemptId, onViewDetailedReport, onReturnDashboard }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReport() {
      try {
        const res = await api.get(`/attempts/${attemptId}/result`);
        setReport(res);
        if (res.passed) {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 }
          });
        }
      } catch (err) {
        console.error('Failed to load result:', err);
      } finally {
        setLoading(false);
      }
    }
    loadReport();
  }, [attemptId]);

  if (loading) {
    return (
      <div className="main-content" style={{ textAlign: 'center', padding: '5rem' }}>
        <div style={{ color: 'var(--text-muted)' }}>Generating proctoring assessment...</div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="main-content" style={{ textAlign: 'center', padding: '5rem' }}>
        <div>Examination report not found.</div>
        <button onClick={onReturnDashboard} className="btn btn-primary" style={{ marginTop: '1rem' }}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="main-content" style={{ maxWidth: '820px' }}>
      <div className="glass-card" style={{ padding: '2.5rem', textAlign: 'center' }}>
        {/* Header Icon */}
        <div style={{
          display: 'inline-flex',
          padding: '1rem',
          borderRadius: '50%',
          backgroundColor: report.passed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          color: report.passed ? '#10b981' : '#ef4444',
          marginBottom: '1rem'
        }}>
          {report.passed ? <CheckCircle2 size={48} /> : <XCircle size={48} />}
        </div>

        <h1 style={{ fontSize: '1.85rem', marginBottom: '0.25rem' }}>
          {report.passed ? 'Examination Successfully Completed!' : 'Examination Assessment Submitted'}
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '2rem' }}>
          Course: <strong>{report.exam_title}</strong>
        </p>

        {/* Score Breakdown Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div className="glass-card" style={{ backgroundColor: 'var(--bg-secondary)', padding: '1.25rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Score Obtained</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
              {report.score} / {report.max_score}
            </div>
            <div style={{ fontSize: '0.8rem', color: report.passed ? '#10b981' : '#ef4444', fontWeight: 600 }}>
              {report.percentage}% ({report.passed ? 'PASSED' : 'FAILED'})
            </div>
          </div>

          <div className="glass-card" style={{ backgroundColor: 'var(--bg-secondary)', padding: '1.25rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>AI Proctoring Suspicion Score</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '4px' }}>
              {report.suspicion_score || 0} pts
            </div>
            <div style={{ marginTop: '4px' }}>
              <RiskBadge score={report.suspicion_score || 0} level={report.risk_level} />
            </div>
          </div>
        </div>

        {/* Info banner */}
        <div style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '1rem',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          marginBottom: '2rem',
          textAlign: 'left'
        }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
            AI Proctoring Audit Summary
          </div>
          All webcam video frames, gaze orientations, and audio signals recorded during this session have been logged with timestamps and associated with your candidate record for human proctor verification.
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <button onClick={onReturnDashboard} className="btn btn-secondary">
            <LayoutDashboard size={16} /> Return to Dashboard
          </button>
          <button onClick={() => onViewDetailedReport(attemptId)} className="btn btn-primary">
            <FileText size={16} /> View Detailed Audit Report <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
