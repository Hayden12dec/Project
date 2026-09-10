import React, { useState } from 'react';
import { auth } from '../services/auth';
import { Shield, User, LogOut, LayoutDashboard, MonitorPlay, FileText, CheckCircle2, Trash2, AlertTriangle } from 'lucide-react';

export default function Navbar({ currentRoute, setCurrentRoute }) {
  const user = auth.getUser();
  const isAdmin = auth.isAdmin();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!user) return null;

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await auth.deleteAccount();
    } catch (err) {
      alert(err.message || 'Failed to delete account');
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  return (
    <>
      <nav style={{
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
        padding: '0.75rem 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 40
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
             onClick={() => setCurrentRoute(isAdmin ? 'admin-dashboard' : 'student-dashboard')}>
          <div style={{
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            padding: '0.45rem',
            borderRadius: '8px',
            color: 'var(--accent-blue)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(59, 130, 246, 0.3)'
          }}>
            <Shield size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>
              SmartProctor <span style={{ color: 'var(--accent-blue)', fontSize: '0.75rem', fontWeight: 600, border: '1px solid var(--accent-blue)', padding: '1px 6px', borderRadius: '4px' }}>AI</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              AI Examination Proctoring System
            </div>
          </div>
        </div>

        {/* Nav Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {isAdmin ? (
            <>
              <button
                className={`btn btn-sm ${currentRoute === 'admin-dashboard' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setCurrentRoute('admin-dashboard')}
              >
                <LayoutDashboard size={16} /> Analytics
              </button>
              <button
                className={`btn btn-sm ${currentRoute === 'admin-live' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setCurrentRoute('admin-live')}
              >
                <MonitorPlay size={16} /> Live Proctoring
              </button>
              <button
                className={`btn btn-sm ${currentRoute === 'admin-exams' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setCurrentRoute('admin-exams')}
              >
                <FileText size={16} /> Manage Exams
              </button>
              <button
                className={`btn btn-sm ${currentRoute === 'profile' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setCurrentRoute('profile')}
              >
                <User size={16} /> Profile
              </button>
            </>
          ) : (
            <>
              <button
                className={`btn btn-sm ${currentRoute === 'student-dashboard' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setCurrentRoute('student-dashboard')}
              >
                <LayoutDashboard size={16} /> My Exams
              </button>
              <button
                className={`btn btn-sm ${currentRoute === 'profile' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setCurrentRoute('profile')}
              >
                <User size={16} /> Profile
              </button>
            </>
          )}
        </div>

        {/* User profile & actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            onClick={() => setCurrentRoute('profile')}
            title="Click to edit your profile and settings"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              textAlign: 'right',
              cursor: 'pointer',
              padding: '0.35rem 0.6rem',
              borderRadius: '8px',
              border: currentRoute === 'profile' ? '1px solid var(--accent-blue)' : '1px solid transparent',
              backgroundColor: currentRoute === 'profile' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
              transition: 'all 0.15s ease'
            }}
          >
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{user.name}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {isAdmin ? (user.subject && user.subject !== 'All Subjects' ? `ADMIN • ${user.subject.toUpperCase()}` : 'CHIEF PROCTOR') : `STUDENT • ${user.student_id || 'STU'}`}
              </div>
            </div>
            {user.face_reference ? (
              <img
                src={user.face_reference}
                alt="Avatar"
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: `2px solid ${isAdmin ? '#f59e0b' : '#3b82f6'}`
                }}
              />
            ) : (
              <div style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                backgroundColor: isAdmin ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                color: isAdmin ? '#f59e0b' : '#60a5fa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.85rem',
                border: `1px solid ${isAdmin ? '#f59e0b' : '#3b82f6'}`
              }}>
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <button
            onClick={() => setShowDeleteModal(true)}
            title="Delete Account"
            className="btn btn-secondary btn-sm"
            style={{
              padding: '0.45rem',
              color: '#f87171',
              borderColor: 'rgba(239, 68, 68, 0.3)'
            }}
          >
            <Trash2 size={16} />
          </button>

          <button
            onClick={() => auth.logout()}
            title="Sign Out"
            className="btn btn-secondary btn-sm"
            style={{ padding: '0.45rem' }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </nav>

      {/* Delete Account Confirmation Modal */}
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
              Are you sure you want to permanently delete the account for <strong style={{ color: '#fff' }}>{user.name}</strong> ({user.email})?
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
    </>
  );
}

