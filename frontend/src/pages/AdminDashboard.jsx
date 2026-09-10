import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { auth } from '../services/auth';
import MetricCard from '../components/MetricCard';
import RiskBadge from '../components/RiskBadge';
import { IncidentBreakdownChart, ScoreDistributionChart } from '../components/Charts';
import {
  Users,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Activity,
  FileText,
  Eye,
  RefreshCw,
  Trash2,
  Sparkles,
  User
} from 'lucide-react';

export default function AdminDashboard({ onSelectReport, onGoLive, onOpenProfile }) {
  const user = auth.getUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const loadStats = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/dashboard');
      setData(res);
    } catch (err) {
      console.error('Failed to load admin stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearAllSessions = async () => {
    if (!window.confirm('Are you sure you want to clear all examination sessions and proctoring audit records?')) {
      return;
    }
    setClearing(true);
    try {
      await api.delete('/admin/attempts/clear');
      await loadStats();
    } catch (err) {
      alert(err.message || 'Failed to clear sessions');
    } finally {
      setClearing(false);
    }
  };

  const handleDeleteSession = async (attemptId) => {
    if (!window.confirm('Delete this examination session record?')) {
      return;
    }
    try {
      await api.delete(`/admin/attempts/${attemptId}`);
      await loadStats();
    } catch (err) {
      alert(err.message || 'Failed to delete session');
    }
  };

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 10000); // 10s auto-refresh
    return () => clearInterval(interval);
  }, []);

  const metrics = data?.metrics || {};
  const charts = data?.charts || {};
  const recentAttempts = data?.recent_attempts || [];
  const adminSubject = data?.admin_subject || user?.subject;
  const isScoped = !!(adminSubject && adminSubject !== 'All Subjects');
  const [activeTab, setActiveTab] = useState('sessions');
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  const loadStudents = async () => {
    setLoadingStudents(true);
    try {
      const res = await api.get('/admin/students');
      setStudents(res || []);
    } catch (err) {
      console.error('Failed to load students:', err);
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleDeleteStudent = async (studentId, studentName) => {
    if (!window.confirm(`Are you sure you want to permanently delete student '${studentName}' and all their exam attempts?`)) {
      return;
    }
    try {
      await api.delete(`/admin/students/${studentId}`);
      await Promise.all([loadStats(), loadStudents()]);
    } catch (err) {
      alert(err.message || 'Failed to delete student account');
    }
  };

  useEffect(() => {
    if (activeTab === 'students') {
      loadStudents();
    }
  }, [activeTab]);

  return (
    <div className="main-content">
      {/* Top Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.85rem', marginBottom: '0.25rem' }}>Proctoring Analytics & Surveillance</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Real-time AI computer vision telemetries, incident breakdown, and candidate audit logs
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {onOpenProfile && (
            <button
              onClick={onOpenProfile}
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', borderColor: 'rgba(59, 130, 246, 0.4)' }}
            >
              <User size={14} color="var(--accent-blue)" /> Edit Profile
            </button>
          )}
          <button onClick={() => { loadStats(); if (activeTab === 'students') loadStudents(); }} disabled={loading} className="btn btn-secondary btn-sm">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={onGoLive} className="btn btn-primary btn-sm">
            <Activity size={14} /> Open Live Monitoring Room
          </button>
        </div>
      </div>

      {/* Scoped Subject Notice */}
      {isScoped && (
        <div style={{
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '8px',
          padding: '0.7rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem'
        }}>
          <span style={{ backgroundColor: '#f59e0b', color: '#000', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
            DOMAIN
          </span>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fcd34d' }}>
            {adminSubject} Department
          </span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            • Displaying exams, sessions, and proctoring incidents for the <strong>{adminSubject}</strong> subject domain.
          </span>
        </div>
      )}

      {/* KPI Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <MetricCard
          title="Total Candidates"
          value={metrics.total_students || 0}
          subtitle="Enrolled students"
          icon={Users}
          color="var(--accent-blue)"
        />
        <MetricCard
          title="Active Sessions"
          value={metrics.active_sessions || 0}
          subtitle="Exams in progress"
          icon={Activity}
          color="#38bdf8"
        />
        <MetricCard
          title="Completed Exams"
          value={metrics.completed_exams || 0}
          subtitle="Submitted attempts"
          icon={CheckCircle2}
          color="#10b981"
        />
        <MetricCard
          title="Suspicious Sessions"
          value={metrics.suspicious_sessions || 0}
          subtitle="Score >= 30 pts"
          icon={AlertTriangle}
          color="#f59e0b"
        />
        <MetricCard
          title="High-Risk Sessions"
          value={metrics.high_risk_sessions || 0}
          subtitle="Score >= 60 pts"
          icon={ShieldAlert}
          color="#ef4444"
        />
      </div>

      {/* Analytics Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '1.5rem', marginBottom: '2.5rem' }}>
        <div className="glass-card">
          <h3 style={{ fontSize: '1.05rem', marginBottom: '1rem' }}>Flagged Suspicious Incidents by Type</h3>
          <IncidentBreakdownChart data={charts.events_by_type || {}} />
        </div>

        <div className="glass-card">
          <h3 style={{ fontSize: '1.05rem', marginBottom: '1rem' }}>Suspicion Score Distribution</h3>
          <ScoreDistributionChart data={charts.score_distribution || {}} />
        </div>
      </div>

      {/* Tables Section with Tabs */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={() => setActiveTab('sessions')}
              className={`btn btn-sm ${activeTab === 'sessions' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.85rem' }}
            >
              Examination Sessions ({recentAttempts.length})
            </button>
            <button
              onClick={() => setActiveTab('students')}
              className={`btn btn-sm ${activeTab === 'students' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.85rem' }}
            >
              <Users size={14} /> Enrolled Candidates ({metrics.total_students || 0})
            </button>
          </div>

          {activeTab === 'sessions' && recentAttempts.length > 0 && (
            <button
              onClick={handleClearAllSessions}
              disabled={clearing}
              className="btn btn-secondary btn-sm"
              style={{
                borderColor: 'rgba(239, 68, 68, 0.4)',
                color: '#f87171',
                fontSize: '0.78rem'
              }}
            >
              <Trash2 size={13} color="#ef4444" />
              {clearing ? 'Clearing Sessions...' : 'Clear All Sessions'}
            </button>
          )}
        </div>

        {activeTab === 'sessions' ? (
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Examination Course</th>
                  <th>Score</th>
                  <th>Proctor Risk</th>
                  <th>Flagged Events</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentAttempts.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      No examination sessions recorded yet.
                    </td>
                  </tr>
                ) : (
                  recentAttempts.map(att => (
                    <tr key={att.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{att.student_name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{att.student_code || 'STU101'}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.875rem' }}>{att.exam_title}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {new Date(att.started_at).toLocaleTimeString()}
                        </div>
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {att.score !== undefined ? `${att.score} / ${att.max_score}` : 'In Progress'}
                      </td>
                      <td>
                        <RiskBadge score={att.suspicion_score || 0} level={att.risk_level} />
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {att.total_events || 0} events
                      </td>
                      <td>
                        <span className={`badge ${att.status === 'in_progress' ? 'badge-med' : 'badge-low'}`}>
                          {att.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <button
                            onClick={() => onSelectReport(att.id)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                            title="View Audit Report"
                          >
                            <Eye size={13} /> View Audit
                          </button>
                          <button
                            onClick={() => handleDeleteSession(att.id)}
                            className="btn btn-secondary btn-sm"
                            style={{
                              padding: '0.35rem 0.5rem',
                              borderColor: 'rgba(239, 68, 68, 0.3)',
                              color: '#f87171'
                            }}
                            title="Delete Session"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>Email</th>
                  <th>Student ID</th>
                  <th>Facial Baseline</th>
                  <th>Exam Sessions</th>
                  <th>Registered Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loadingStudents ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      Loading candidates...
                    </td>
                  </tr>
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      No registered candidates found.
                    </td>
                  </tr>
                ) : (
                  students.map(st => (
                    <tr key={st.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#fff' }}>{st.name}</div>
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {st.email}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-blue)' }}>
                        {st.student_id || 'STU101'}
                      </td>
                      <td>
                        <span className={`badge ${st.has_face_reference ? 'badge-low' : 'badge-med'}`}>
                          {st.has_face_reference ? 'Enrolled' : 'Pending'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {st.attempts_count} session(s)
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {st.created_at ? new Date(st.created_at).toLocaleDateString() : 'N/A'}
                      </td>
                      <td>
                        <button
                          onClick={() => handleDeleteStudent(st.id, st.name)}
                          className="btn btn-secondary btn-sm"
                          style={{
                            padding: '0.35rem 0.65rem',
                            borderColor: 'rgba(239, 68, 68, 0.3)',
                            color: '#f87171',
                            fontSize: '0.75rem'
                          }}
                          title="Delete Candidate Account"
                        >
                          <Trash2 size={13} /> Delete Account
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

