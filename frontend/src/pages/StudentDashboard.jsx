import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { auth } from '../services/auth';
import MetricCard from '../components/MetricCard';
import RiskBadge from '../components/RiskBadge';
import {
  BookOpen,
  CheckCircle,
  Clock,
  Play,
  Award,
  FileText,
  AlertCircle,
  ArrowRight,
  Search,
  Tag,
  Layers,
  X,
  Trash2,
  Shield,
  User
} from 'lucide-react';

export default function StudentDashboard({ onSelectExam, onViewResult, onOpenProfile }) {
  const user = auth.getUser();
  const [exams, setExams] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    async function loadData() {
      try {
        const [examsData, attemptsData] = await Promise.all([
          api.get('/exams'),
          api.get('/attempts/my')
        ]);
        setExams(examsData || []);
        setAttempts(attemptsData || []);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const completedAttempts = attempts.filter(a => a.status === 'submitted' || a.status === 'evaluated');
  const avgScore = completedAttempts.length > 0
    ? (completedAttempts.reduce((acc, a) => acc + (a.percentage || 0), 0) / completedAttempts.length).toFixed(1)
    : 0;

  // Compute unique categories / subject codes
  const categories = useMemo(() => {
    const set = new Set();
    exams.forEach(e => {
      if (e.category) set.add(e.category);
      if (e.subject_code) set.add(e.subject_code);
    });
    return Array.from(set).sort();
  }, [exams]);

  // Filter exams by search and category
  const filteredExams = useMemo(() => {
    return exams.filter(exam => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = exam.title?.toLowerCase().includes(q);
        const matchCode = exam.subject_code?.toLowerCase().includes(q);
        const matchCategory = exam.category?.toLowerCase().includes(q);
        const matchDesc = exam.description?.toLowerCase().includes(q);
        if (!matchTitle && !matchCode && !matchCategory && !matchDesc) {
          return false;
        }
      }

      if (selectedCategory !== 'all') {
        const matchesCat = exam.category?.toLowerCase() === selectedCategory.toLowerCase();
        const matchesCode = exam.subject_code?.toLowerCase() === selectedCategory.toLowerCase();
        if (!matchesCat && !matchesCode) {
          return false;
        }
      }

      return true;
    });
  }, [exams, searchQuery, selectedCategory]);

  return (
    <div className="main-content">
      {/* Welcome Banner */}
      <div className="glass-card" style={{
        marginBottom: '2rem',
        padding: '1.75rem 2rem',
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9))',
        border: '1px solid rgba(59, 130, 246, 0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--accent-blue)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Candidate Examination Portal
          </span>
          <h1 style={{ fontSize: '1.85rem', marginTop: '0.2rem', marginBottom: '0.4rem' }}>
            Welcome back, {user?.name}
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Student ID: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{user?.student_id || 'STU101'}</span> • All exams are actively monitored by SmartProctor AI.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {onOpenProfile && (
            <button
              onClick={onOpenProfile}
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', borderColor: 'rgba(59, 130, 246, 0.4)' }}
            >
              <User size={15} color="var(--accent-blue)" /> Edit Profile
            </button>
          )}

          <div style={{
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            padding: '0.6rem 1.25rem',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.72rem', color: '#6ee7b7' }}>Average Score</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#10b981' }}>{avgScore}%</div>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2.5rem' }}>
        <MetricCard
          title="Available Exams"
          value={exams.length}
          subtitle="Ready for candidate assessment"
          icon={BookOpen}
          color="var(--accent-blue)"
        />
        <MetricCard
          title="Completed Exams"
          value={completedAttempts.length}
          subtitle="Evaluated & submitted"
          icon={CheckCircle}
          color="#10b981"
        />
        <MetricCard
          title="AI Verification"
          value={user?.has_face_reference ? "Enrolled" : "Pending"}
          subtitle={user?.has_face_reference ? "Facial baseline verified" : "Will verify before exam"}
          icon={Award}
          color="#f59e0b"
        />
      </div>

      {/* Available Examinations Section */}
      <div style={{ marginBottom: '3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem' }}>Scheduled Examinations</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Select an examination course to proceed through system hardware check</p>
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', minWidth: '240px', maxWidth: '320px', width: '100%' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search exams by subject or title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '2.3rem', fontSize: '0.825rem' }}
            />
            <Search size={14} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Subject Filter Pills */}
        {categories.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '0.25rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Tag size={12} /> Category:
            </span>

            <button
              onClick={() => setSelectedCategory('all')}
              style={{
                padding: '0.25rem 0.65rem',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: selectedCategory === 'all' ? 600 : 400,
                backgroundColor: selectedCategory === 'all' ? 'rgba(59, 130, 246, 0.2)' : 'var(--bg-secondary)',
                color: selectedCategory === 'all' ? 'var(--accent-blue)' : 'var(--text-secondary)',
                border: selectedCategory === 'all' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid var(--border-subtle)',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              All Subjects ({exams.length})
            </button>

            {categories.map(cat => {
              const count = exams.filter(e => e.category === cat || e.subject_code === cat).length;
              const isSelected = selectedCategory.toLowerCase() === cat.toLowerCase();
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: '0.25rem 0.65rem',
                    borderRadius: '999px',
                    fontSize: '0.75rem',
                    fontWeight: isSelected ? 600 : 400,
                    backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'var(--bg-secondary)',
                    color: isSelected ? 'var(--accent-blue)' : 'var(--text-secondary)',
                    border: isSelected ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            Loading available examinations...
          </div>
        ) : filteredExams.length === 0 ? (
          <div className="glass-card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <Layers size={32} style={{ margin: '0 auto 0.5rem auto', opacity: 0.4 }} />
            <p>No exams match your search / category filter.</p>
            {(searchQuery || selectedCategory !== 'all') && (
              <button
                onClick={() => { setSelectedCategory('all'); setSearchQuery(''); }}
                className="btn btn-secondary btn-sm"
                style={{ marginTop: '0.75rem' }}
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
            {filteredExams.map(exam => {
              const attempt = attempts.find(a => a.exam_id === exam.id);
              const isCompleted = attempt && (attempt.status === 'submitted' || attempt.status === 'evaluated');
              const isInProgress = attempt && attempt.status === 'in_progress';

              return (
                <div key={exam.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <span className="badge" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-blue)', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                          {exam.subject_code}
                        </span>
                        {exam.category && exam.category !== exam.subject_code && (
                          <span className="badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#6ee7b7', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                            {exam.category}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={13} /> {exam.duration_minutes} mins
                      </span>
                    </div>

                    <h3 style={{ fontSize: '1.15rem', marginBottom: '0.5rem', lineHeight: 1.3 }}>
                      {exam.title}
                    </h3>
                    <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                      {exam.description}
                    </p>
                  </div>

                  <div>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      borderTop: '1px solid var(--border-subtle)',
                      paddingTop: '0.75rem',
                      marginBottom: '1rem',
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)'
                    }}>
                      <span>Questions: <strong>{exam.questions_count || 10}</strong></span>
                      <span>Passing Score: <strong>{exam.passing_marks}%</strong></span>
                    </div>

                    {isCompleted ? (
                      <button
                        onClick={() => onViewResult(attempt.id)}
                        className="btn btn-secondary btn-sm"
                        style={{ width: '100%' }}
                      >
                        <FileText size={15} /> View Performance & Report
                      </button>
                    ) : (
                      <button
                        onClick={() => onSelectExam(exam)}
                        className="btn btn-primary btn-sm"
                        style={{ width: '100%' }}
                      >
                        <Play size={15} /> {isInProgress ? 'Resume Examination' : 'Start Pre-Exam Check'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Past Attempts Table */}
      {completedAttempts.length > 0 && (
        <div>
          <h2 style={{ fontSize: '1.35rem', marginBottom: '1rem' }}>Past Examination Reports</h2>
          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Examination</th>
                  <th>Submitted Date</th>
                  <th>Score</th>
                  <th>Result</th>
                  <th>Proctoring Risk</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {completedAttempts.map(att => (
                  <tr key={att.id}>
                    <td style={{ fontWeight: 600 }}>{att.exam_title}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                      {new Date(att.submitted_at || att.started_at).toLocaleDateString()}
                    </td>
                    <td style={{ fontWeight: 700 }}>
                      {att.score} / {att.max_score} ({att.percentage}%)
                    </td>
                    <td>
                      <span className={`badge ${att.passed ? 'badge-low' : 'badge-high'}`}>
                        {att.passed ? 'PASSED' : 'FAILED'}
                      </span>
                    </td>
                    <td>
                      <RiskBadge score={att.suspicion_score || 0} level={att.risk_level} />
                    </td>
                    <td>
                      <button
                        onClick={() => onViewResult(att.id)}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                      >
                        View Report <ArrowRight size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Account Settings & Danger Zone */}
      <div className="glass-card" style={{
        marginTop: '3rem',
        padding: '1.5rem 2rem',
        border: '1px solid rgba(239, 68, 68, 0.25)',
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1.5rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '1rem', fontWeight: 600, color: '#fca5a5' }}>
              Account & Data Management
            </span>
          </div>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', margin: 0 }}>
            Logged in as <strong>{user?.name}</strong> ({user?.email}) • Student ID: {user?.student_id || 'STU101'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {onOpenProfile && (
            <button
              onClick={onOpenProfile}
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}
            >
              <User size={14} color="var(--accent-blue)" /> Edit Profile Details
            </button>
          )}

          <button
            onClick={async () => {
              if (window.confirm('Are you sure you want to permanently delete your account? All your exam attempts and facial enrollment baseline will be wiped.')) {
                try {
                  await auth.deleteAccount();
                } catch (err) {
                  alert(err.message || 'Failed to delete account');
                }
              }
            }}
            className="btn btn-secondary btn-sm"
            style={{
              borderColor: 'rgba(239, 68, 68, 0.4)',
              color: '#f87171',
              padding: '0.5rem 1rem'
            }}
          >
            <Trash2 size={14} color="#ef4444" /> Delete My Account
          </button>
        </div>
      </div>
    </div>
  );
}

