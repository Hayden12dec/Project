import React from 'react';

export default function MetricCard({ title, value, subtitle, icon: Icon, color = 'var(--accent-blue)', badge = null }) {
  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {title}
        </span>
        {Icon && (
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            padding: '0.45rem',
            borderRadius: '8px',
            color: color,
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            <Icon size={18} />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
        <span style={{ fontSize: '1.85rem', fontWeight: 700, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
          {value}
        </span>
        {badge}
      </div>

      {subtitle && (
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {subtitle}
        </span>
      )}
    </div>
  );
}
