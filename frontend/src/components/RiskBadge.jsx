import React from 'react';
import { ShieldCheck, AlertTriangle, AlertOctagon } from 'lucide-react';

export default function RiskBadge({ score = 0, level = null, showScore = true }) {
  let risk = level;
  if (!risk) {
    if (score >= 60) risk = 'HIGH';
    else if (score >= 30) risk = 'MEDIUM';
    else risk = 'LOW';
  }

  let badgeClass = 'badge-low';
  let Icon = ShieldCheck;
  let label = 'Low Risk';

  if (risk === 'HIGH') {
    badgeClass = 'badge-high';
    Icon = AlertOctagon;
    label = 'High Risk';
  } else if (risk === 'MEDIUM') {
    badgeClass = 'badge-med';
    Icon = AlertTriangle;
    label = 'Medium Risk';
  }

  return (
    <span className={`badge ${badgeClass}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      <Icon size={13} />
      <span>{label}</span>
      {showScore && <span style={{ opacity: 0.85, fontWeight: 700 }}>({score} pts)</span>}
    </span>
  );
}
