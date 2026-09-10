import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import WebcamMonitor from '../components/WebcamMonitor';
import QuestionPalette from '../components/QuestionPalette';
import DemoControlPanel from '../components/DemoControlPanel';
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  CheckCircle,
  AlertOctagon,
  Shield,
  Maximize,
  HelpCircle,
  Send
} from 'lucide-react';

export default function ExamSessionPage({ exam, attempt, onExamSubmitted }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState(attempt?.answers || {});
  const [markedForReview, setMarkedForReview] = useState(attempt?.marked_for_review || []);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState((exam?.duration_minutes || 30) * 60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [suspicionScore, setSuspicionScore] = useState(attempt?.suspicion_score || 0);
  const [riskLevel, setRiskLevel] = useState(attempt?.risk_level || 'LOW');

  const questions = exam?.questions || [];
  const currentQuestion = questions[currentIdx] || null;

  // Countdown Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeftSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleFinalSubmit(true); // Auto-submit on expiration
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const attemptId = attempt?.id || attempt?._id;

  // Tab switch / Visibility change listener
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && attemptId) {
        api.post('/proctoring/event', {
          attempt_id: attemptId,
          event_type: 'TAB_SWITCH_DETECTED',
          confidence: 1.0,
          metadata: { note: 'Candidate navigated away from examination tab' }
        }).catch(err => console.debug(err));
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [attemptId]);

  const handleSelectOption = async (optionIndex) => {
    if (!currentQuestion || !attemptId) return;
    const qId = currentQuestion.id || currentQuestion._id;
    const updatedAnswers = { ...answers, [qId]: optionIndex };
    setAnswers(updatedAnswers);

    // Auto-save to backend
    try {
      await api.post(`/attempts/${attemptId}/answer`, {
        question_id: qId,
        selected_option: optionIndex
      });
    } catch (err) {
      console.error('Answer save failed:', err);
    }
  };

  const handleToggleReview = async () => {
    if (!currentQuestion || !attemptId) return;
    const qId = currentQuestion.id || currentQuestion._id;
    const isMarked = markedForReview.includes(qId);
    const updatedMarked = isMarked
      ? markedForReview.filter(id => id !== qId)
      : [...markedForReview, qId];

    setMarkedForReview(updatedMarked);

    try {
      await api.post(`/attempts/${attemptId}/answer`, {
        question_id: qId,
        mark_for_review: !isMarked
      });
    } catch (err) {
      console.error('Review toggle save failed:', err);
    }
  };

  const handleFinalSubmit = async (auto = false) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (!attemptId) {
        throw new Error('Attempt ID not found');
      }
      const res = await api.post(`/attempts/${attemptId}/submit`, {
        answers: answers
      });
      setShowSubmitModal(false);
      onExamSubmitted(res || { id: attemptId });
    } catch (err) {
      console.error('Submission failed:', err);
      alert(err.message || 'Failed to submit examination. Please try again.');
      setIsSubmitting(false);
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isCurrentMarked = currentQuestion && markedForReview.includes(currentQuestion.id || currentQuestion._id);
  const currentSelectedAnswer = currentQuestion ? answers[currentQuestion.id || currentQuestion._id] : undefined;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)' }}>
      {/* Top Examination HUD Bar */}
      <header style={{
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
        padding: '0.75rem 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            padding: '0.4rem 0.65rem',
            borderRadius: '6px',
            color: 'var(--accent-blue)',
            fontWeight: 700,
            fontSize: '0.825rem',
            border: '1px solid rgba(59, 130, 246, 0.3)'
          }}>
            {exam?.subject_code}
          </div>
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>{exam?.title}</h2>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Candidate: {attempt?.student_name} ({attempt?.student_code || 'STU101'})
            </span>
          </div>
        </div>

        {/* Timer Display */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            backgroundColor: timeLeftSeconds < 300 ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-surface)',
            border: `1px solid ${timeLeftSeconds < 300 ? '#ef4444' : 'var(--border-color)'}`,
            padding: '0.45rem 1rem',
            borderRadius: '8px',
            color: timeLeftSeconds < 300 ? '#fca5a5' : 'var(--text-primary)'
          }}>
            <Clock size={16} color={timeLeftSeconds < 300 ? '#ef4444' : 'var(--accent-blue)'} />
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.1rem' }}>
              {formatTimer(timeLeftSeconds)}
            </span>
          </div>

          <button
            onClick={() => setShowSubmitModal(true)}
            className="btn btn-success btn-sm"
            style={{ fontWeight: 600 }}
          >
            <Send size={14} /> Submit Examination
          </button>
        </div>
      </header>

      {/* Main Examination Grid */}
      <div className="main-content" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.75rem', alignItems: 'start' }}>
        {/* Left Column: Question Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="glass-card" style={{ minHeight: '420px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            {currentQuestion ? (
              <div>
                {/* Question Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-blue)' }}>
                    QUESTION {currentIdx + 1} OF {questions.length}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Marks: {currentQuestion.marks || 1}
                    </span>
                    <button
                      onClick={handleToggleReview}
                      className={`btn btn-sm ${isCurrentMarked ? 'btn-secondary' : 'btn-secondary'}`}
                      style={{
                        fontSize: '0.75rem',
                        borderColor: isCurrentMarked ? '#f59e0b' : 'var(--border-color)',
                        color: isCurrentMarked ? '#fbbf24' : 'var(--text-secondary)'
                      }}
                    >
                      <Bookmark size={13} fill={isCurrentMarked ? '#f59e0b' : 'none'} />
                      {isCurrentMarked ? 'Marked for Review' : 'Mark for Review'}
                    </button>
                  </div>
                </div>

                {/* Question Text */}
                <p style={{ fontSize: '1.05rem', lineHeight: 1.5, fontWeight: 500, marginBottom: '1.75rem', color: 'var(--text-primary)' }}>
                  {currentQuestion.question_text}
                </p>

                {/* Options List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {currentQuestion.options.map((optText, optIdx) => {
                    const isSelected = currentSelectedAnswer === optIdx;
                    return (
                      <div
                        key={optIdx}
                        onClick={() => handleSelectOption(optIdx)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.85rem',
                          padding: '0.85rem 1.15rem',
                          borderRadius: '8px',
                          backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-secondary)',
                          border: `1px solid ${isSelected ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          border: `2px solid ${isSelected ? 'var(--accent-blue)' : 'var(--text-muted)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          backgroundColor: isSelected ? 'var(--accent-blue)' : 'transparent',
                          color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                          flexShrink: 0
                        }}>
                          {String.fromCharCode(65 + optIdx)}
                        </div>
                        <span style={{ fontSize: '0.925rem', color: isSelected ? '#ffffff' : 'var(--text-secondary)' }}>
                          {optText}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                No questions found in this examination.
              </div>
            )}

            {/* Bottom Nav Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
              <button
                onClick={() => setCurrentIdx(prev => Math.max(0, prev - 1))}
                disabled={currentIdx === 0}
                className="btn btn-secondary btn-sm"
              >
                <ChevronLeft size={16} /> Previous
              </button>

              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {answers[currentQuestion?.id || currentQuestion?._id] !== undefined ? (
                  <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle size={14} /> Answer Saved
                  </span>
                ) : (
                  <span>Unanswered</span>
                )}
              </div>

              <button
                onClick={() => setCurrentIdx(prev => Math.min(questions.length - 1, prev + 1))}
                disabled={currentIdx === questions.length - 1}
                className="btn btn-primary btn-sm"
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* VIVA DEMO / TEST MODE TOOLBAR */}
          <DemoControlPanel
            attemptId={attemptId}
            onEventTriggered={(res) => {
              setSuspicionScore(res.new_suspicion_score);
              setRiskLevel(res.risk_level);
            }}
          />
        </div>

        {/* Right Column: AI Live Proctoring Feed + Question Palette */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <WebcamMonitor
            attemptId={attemptId}
            isPaused={isSubmitting || showSubmitModal}
            onSuspicionChange={(score, level) => {
              setSuspicionScore(score);
              setRiskLevel(level);
            }}
          />

          <QuestionPalette
            questions={questions}
            currentIndex={currentIdx}
            answers={answers}
            markedForReview={markedForReview}
            onSelectQuestion={(idx) => setCurrentIdx(idx)}
          />
        </div>
      </div>

      {/* Final Submit Confirmation Modal */}
      {showSubmitModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '1.5rem'
        }}>
          <div className="glass-card" style={{ maxWidth: '460px', width: '100%', padding: '2rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid #475569' }}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Confirm Examination Submission?</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              You have answered <strong>{Object.keys(answers).length}</strong> out of <strong>{questions.length}</strong> questions. Once submitted, your answers will be automatically evaluated and the AI proctoring audit log will be generated.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSubmitModal(false)}
                disabled={isSubmitting}
                className="btn btn-secondary btn-sm"
              >
                Cancel & Review
              </button>
              <button
                onClick={() => handleFinalSubmit(false)}
                disabled={isSubmitting}
                className="btn btn-success btn-sm"
              >
                {isSubmitting ? 'Submitting...' : 'Yes, Submit Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
