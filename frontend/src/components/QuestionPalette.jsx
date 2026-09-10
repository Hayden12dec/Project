import React from 'react';

export default function QuestionPalette({
  questions = [],
  currentIndex = 0,
  answers = {},
  markedForReview = [],
  onSelectQuestion
}) {
  return (
    <div className="glass-card" style={{ padding: '1rem', width: '280px' }}>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Question Palette</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {Object.keys(answers).length} / {questions.length} Solved
        </span>
      </div>

      {/* Grid of question buttons */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '0.5rem',
        marginBottom: '1rem'
      }}>
        {questions.map((q, idx) => {
          const qId = q.id || q._id;
          const isCurrent = idx === currentIndex;
          const isAnswered = answers[qId] !== undefined;
          const isMarked = markedForReview.includes(qId);

          let bg = 'var(--bg-secondary)';
          let border = '1px solid var(--border-color)';
          let textColor = 'var(--text-secondary)';

          if (isMarked) {
            bg = 'rgba(245, 158, 11, 0.2)';
            border = '1px solid #f59e0b';
            textColor = '#fbbf24';
          } else if (isAnswered) {
            bg = 'rgba(16, 185, 129, 0.2)';
            border = '1px solid #10b981';
            textColor = '#6ee7b7';
          }

          if (isCurrent) {
            border = '2px solid var(--accent-blue)';
            textColor = '#ffffff';
          }

          return (
            <button
              key={qId || idx}
              onClick={() => onSelectQuestion(idx)}
              style={{
                backgroundColor: bg,
                border: border,
                color: textColor,
                borderRadius: '6px',
                padding: '0.45rem 0',
                fontSize: '0.825rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.1s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{
        borderTop: '1px solid var(--border-subtle)',
        paddingTop: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        fontSize: '0.72rem',
        color: 'var(--text-muted)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: '#10b981' }} />
          <span>Answered</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: '#f59e0b' }} />
          <span>Marked for Review</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }} />
          <span>Unanswered</span>
        </div>
      </div>
    </div>
  );
}
