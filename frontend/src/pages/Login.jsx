import React, { useState } from 'react';
import { auth } from '../services/auth';
import { Shield, KeyRound, Mail, ArrowRight, UserCheck, AlertCircle } from 'lucide-react';

export default function Login({ onLoginSuccess, navigateToRegister, navigateToAdminRegister }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const user = await auth.login(email, password);
      onLoginSuccess(user);
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = (role) => {
    if (role === 'admin') {
      setEmail('admin@proctor.edu');
      setPassword('Admin@123');
    } else {
      setEmail('student@proctor.edu');
      setPassword('Student@123');
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
      backgroundImage: 'radial-gradient(ellipse at 50% 10%, rgba(59, 130, 246, 0.12), transparent 70%)'
    }}>
      <div className="glass-card" style={{ maxWidth: '440px', width: '100%', padding: '2.25rem' }}>
        {/* Logo & Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            display: 'inline-flex',
            padding: '0.75rem',
            borderRadius: '12px',
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            color: 'var(--accent-blue)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            marginBottom: '1rem'
          }}>
            <Shield size={32} />
          </div>
          <h2 style={{ fontSize: '1.6rem', marginBottom: '0.35rem' }}>Smart Examination Proctor</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            AI-Powered Computer Vision Proctoring Platform
          </p>
        </div>

        {error && (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#fca5a5',
            padding: '0.75rem',
            borderRadius: '8px',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '1.25rem'
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Institutional Email</label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                required
                className="form-input"
                placeholder="name@proctor.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ paddingLeft: '2.5rem' }}
              />
              <Mail size={16} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                required
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingLeft: '2.5rem' }}
              />
              <KeyRound size={16} style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem', padding: '0.8rem' }}
          >
            {loading ? 'Authenticating...' : 'Sign In to Portal'} <ArrowRight size={16} />
          </button>
        </form>

        {/* 1-Click Demo Credentials */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '0.6rem' }}>
            QUICK VIVA DEMO CREDENTIALS
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => handleQuickDemo('admin')}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.75rem' }}
            >
              <UserCheck size={13} color="#f59e0b" /> Chief Proctor
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo('student')}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.75rem' }}
            >
              <UserCheck size={13} color="#3b82f6" /> Student Candidate
            </button>
          </div>
        </div>

        {/* Register Links */}
        <div style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
          New student candidate?{' '}
          <button
            onClick={navigateToRegister}
            style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', fontWeight: 600 }}
          >
            Register Profile
          </button>
        </div>
        <div style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Administrator?{' '}
          <button
            onClick={navigateToAdminRegister}
            style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem' }}
          >
            Admin Registration
          </button>
        </div>
      </div>
    </div>
  );
}
