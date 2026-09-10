import React, { useState } from 'react';
import { api } from '../services/api';
import { auth } from '../services/auth';
import {
  ShieldCheck, Mail, KeyRound, User, Lock, ArrowRight, AlertCircle, Eye, EyeOff, BookOpen
} from 'lucide-react';

export default function AdminRegister({ onRegisterSuccess, navigateToLogin }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('DBMS');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const popularSubjects = ['DBMS', 'AI & ML', 'Computer Networks', 'Operating Systems', 'Mathematics', 'All Subjects'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!inviteCode.trim()) {
      setError('Admin invite code is required.');
      return;
    }

    setLoading(true);
    try {
      const data = await api.post('/auth/register-admin', {
        name,
        email,
        subject: subject.trim() || 'All Subjects',
        password,
        invite_code: inviteCode.trim()
      });
      // Store token same way as regular login
      auth.setSession(data);
      onRegisterSuccess(data.user);
    } catch (err) {
      setError(err.message || 'Registration failed. Check your invite code and try again.');
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
      backgroundImage: 'radial-gradient(ellipse at 50% 10%, rgba(245, 158, 11, 0.10), transparent 70%)'
    }}>
      <div className="glass-card" style={{ maxWidth: '480px', width: '100%', padding: '2.25rem' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            display: 'inline-flex',
            padding: '0.75rem',
            borderRadius: '12px',
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            color: '#f59e0b',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            marginBottom: '0.85rem'
          }}>
            <ShieldCheck size={32} />
          </div>
          <h2 style={{ fontSize: '1.55rem', marginBottom: '0.3rem' }}>Admin Registration</h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
            Create a Subject Proctor / Department Administrator account
          </p>
        </div>

        {/* Invite code notice */}
        <div style={{
          backgroundColor: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: '8px',
          padding: '0.6rem 0.9rem',
          fontSize: '0.78rem',
          color: '#fcd34d',
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1.25rem'
        }}>
          <Lock size={14} style={{ marginTop: '1px', flexShrink: 0 }} />
          <span>Admin registration is invite-only. You will manage examinations belonging to your assigned subject domain.</span>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#fca5a5',
            padding: '0.7rem 0.85rem',
            borderRadius: '8px',
            fontSize: '0.825rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1.1rem'
          }}>
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Full Name */}
          <div className="form-group">
            <label className="form-label">Full Name & Title</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                required
                className="form-input"
                placeholder="e.g. Mr. Mongo / Dr. Jane"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ paddingLeft: '2.5rem' }}
              />
              <User size={15} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            </div>
          </div>

          {/* Institutional Email */}
          <div className="form-group">
            <label className="form-label">Institutional Email</label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                required
                className="form-input"
                placeholder="mongo@proctor.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ paddingLeft: '2.5rem' }}
              />
              <Mail size={15} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            </div>
          </div>

          {/* Subject / Specialization */}
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Assigned Subject / Faculty Domain</span>
              <span style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600 }}>Only this subject's tests will be visible</span>
            </label>
            <div style={{ position: 'relative', marginBottom: '0.4rem' }}>
              <input
                type="text"
                required
                list="popular-subjects"
                className="form-input"
                placeholder="e.g. DBMS, AI & ML, CS401, All Subjects"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                style={{ paddingLeft: '2.5rem', borderColor: 'rgba(245, 158, 11, 0.4)' }}
              />
              <BookOpen size={15} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: '#f59e0b' }} />
              <datalist id="popular-subjects">
                {popularSubjects.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>

            {/* Quick Preset Buttons */}
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {popularSubjects.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSubject(s)}
                  style={{
                    padding: '0.2rem 0.5rem',
                    fontSize: '0.7rem',
                    borderRadius: '4px',
                    border: subject === s ? '1px solid #f59e0b' : '1px solid var(--border-subtle)',
                    backgroundColor: subject === s ? 'rgba(245, 158, 11, 0.2)' : 'var(--bg-secondary)',
                    color: subject === s ? '#fcd34d' : 'var(--text-muted)',
                    cursor: 'pointer'
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Password + Confirm side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
                />
                <KeyRound size={15} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Confirm</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="form-input"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{ paddingLeft: '2.5rem' }}
                />
                <KeyRound size={15} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              </div>
            </div>
          </div>

          {/* Invite Code */}
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Admin Invite Code</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>Default: PROCTOR-ADMIN-2026</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showInvite ? 'text' : 'password'}
                required
                className="form-input"
                placeholder="PROCTOR-ADMIN-2026"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                style={{
                  paddingLeft: '2.5rem',
                  paddingRight: '2.5rem',
                  borderColor: 'rgba(245, 158, 11, 0.35)',
                  fontFamily: 'monospace',
                  letterSpacing: '0.05em'
                }}
              />
              <Lock size={15} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: '#f59e0b' }} />
              <button
                type="button"
                onClick={() => setShowInvite(v => !v)}
                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
              >
                {showInvite ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{
              width: '100%',
              marginTop: '0.5rem',
              padding: '0.8rem',
              background: loading ? undefined : 'linear-gradient(135deg, #d97706, #f59e0b)'
            }}
          >
            {loading ? 'Creating Admin Account...' : 'Register as Administrator'} <ArrowRight size={16} />
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
          Already have an account?{' '}
          <button
            onClick={navigateToLogin}
            style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', fontWeight: 600 }}
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  );
}
