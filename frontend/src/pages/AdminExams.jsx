import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { auth } from '../services/auth';
import {
  BookOpen,
  Plus,
  Trash2,
  Edit,
  Clock,
  CheckCircle,
  HelpCircle,
  X,
  Save,
  FileQuestion,
  Search,
  Filter,
  User,
  Tag,
  Layers,
  Sparkles,
  UserCheck
} from 'lucide-react';

export default function AdminExams() {
  const currentUser = auth.getUser();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedExamForQuestions, setSelectedExamForQuestions] = useState(null);
  const [showAddQuestionModal, setShowAddQuestionModal] = useState(false);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [creatorFilter, setCreatorFilter] = useState('all'); // 'all' | 'mine' | 'others'

  const adminSubject = currentUser?.subject && currentUser?.subject !== 'All Subjects' ? currentUser.subject : null;

  // New Exam Form State
  const [newExam, setNewExam] = useState({
    title: '',
    subject_code: adminSubject || '',
    category: adminSubject || 'Computer Science',
    description: '',
    duration_minutes: 30,
    total_marks: 100,
    passing_marks: 40
  });

  // New Question Form State
  const [newQuestion, setNewQuestion] = useState({
    question_text: '',
    options: ['', '', '', ''],
    correct_answer: 0,
    marks: 1,
    explanation: ''
  });

  const loadExams = async () => {
    setLoading(true);
    try {
      const res = await api.get('/exams');
      setExams(res || []);
    } catch (err) {
      console.error('Failed to load exams:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExams();
  }, []);

  // Compute unique categories / subject codes
  const categories = useMemo(() => {
    const set = new Set();
    exams.forEach(e => {
      if (e.category) set.add(e.category);
      if (e.subject_code) set.add(e.subject_code);
    });
    return Array.from(set).sort();
  }, [exams]);

  // Determine if an exam was created by the currently logged-in admin
  const isCreatedByMe = (exam) => {
    if (!currentUser) return false;
    const currentId = String(currentUser.id || currentUser._id || '');
    const currentEmail = String(currentUser.email || '').toLowerCase().trim();
    const examCreatorId = String(exam.created_by || '');
    const examCreatorEmail = String(exam.creator_email || '').toLowerCase().trim();

    return (
      (currentId && examCreatorId === currentId) ||
      (currentEmail && examCreatorEmail === currentEmail)
    );
  };

  // Filtered exams calculation
  const filteredExams = useMemo(() => {
    return exams.filter(exam => {
      // 1. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = exam.title?.toLowerCase().includes(q);
        const matchCode = exam.subject_code?.toLowerCase().includes(q);
        const matchCategory = exam.category?.toLowerCase().includes(q);
        const matchCreator = exam.creator_name?.toLowerCase().includes(q);
        const matchDesc = exam.description?.toLowerCase().includes(q);
        if (!matchTitle && !matchCode && !matchCategory && !matchCreator && !matchDesc) {
          return false;
        }
      }

      // 2. Category / Subject Filter
      if (selectedCategory !== 'all') {
        const matchesCat = exam.category?.toLowerCase() === selectedCategory.toLowerCase();
        const matchesCode = exam.subject_code?.toLowerCase() === selectedCategory.toLowerCase();
        if (!matchesCat && !matchesCode) {
          return false;
        }
      }

      // 3. Creator Filter (All vs Mine vs Others)
      if (creatorFilter === 'mine') {
        if (!isCreatedByMe(exam)) return false;
      } else if (creatorFilter === 'others') {
        if (isCreatedByMe(exam)) return false;
      }

      return true;
    });
  }, [exams, searchQuery, selectedCategory, creatorFilter, currentUser]);

  // Counts for creator filter tabs
  const myExamsCount = useMemo(() => exams.filter(e => isCreatedByMe(e)).length, [exams, currentUser]);
  const othersExamsCount = exams.length - myExamsCount;

  const handleCreateExam = async (e) => {
    e.preventDefault();
    try {
      await api.post('/exams', newExam);
      setShowCreateModal(false);
      setNewExam({
        title: '',
        subject_code: '',
        category: 'Computer Science',
        description: '',
        duration_minutes: 30,
        total_marks: 100,
        passing_marks: 40
      });
      loadExams();
    } catch (err) {
      alert(err.message || 'Failed to create exam');
    }
  };

  const handleDeleteExam = async (examId) => {
    if (!window.confirm('Are you sure you want to delete this examination and all its questions?')) return;
    try {
      await api.delete(`/exams/${examId}`);
      loadExams();
    } catch (err) {
      alert(err.message || 'Failed to delete exam');
    }
  };

  const handleViewQuestions = async (examId) => {
    try {
      const examDetails = await api.get(`/exams/${examId}`);
      setSelectedExamForQuestions(examDetails);
    } catch (err) {
      alert('Failed to load exam details');
    }
  };

  const handleAddQuestion = async (e) => {
    e.preventDefault();
    if (!selectedExamForQuestions) return;
    try {
      await api.post(`/exams/${selectedExamForQuestions.id}/questions`, newQuestion);
      setShowAddQuestionModal(false);
      setNewQuestion({
        question_text: '',
        options: ['', '', '', ''],
        correct_answer: 0,
        marks: 1,
        explanation: ''
      });
      // Refresh questions modal
      handleViewQuestions(selectedExamForQuestions.id);
      loadExams();
    } catch (err) {
      alert(err.message || 'Failed to add question');
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    try {
      await api.delete(`/exams/questions/${questionId}`);
      handleViewQuestions(selectedExamForQuestions.id);
      loadExams();
    } catch (err) {
      alert('Failed to delete question');
    }
  };

  return (
    <div className="main-content">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.85rem', marginBottom: '0.25rem' }}>Course & Examination Bank</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Manage subject-wise question papers, author courses, and categorize across departments
          </p>
        </div>

        <button onClick={() => setShowCreateModal(true)} className="btn btn-primary btn-sm">
          <Plus size={16} /> Create New Examination
        </button>
      </div>

      {/* Admin Subject Domain Active Banner */}
      {adminSubject && (
        <div style={{
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '8px',
          padding: '0.75rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ backgroundColor: '#f59e0b', color: '#000', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
              SUBJECT DOMAIN
            </span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#fcd34d' }}>
              {adminSubject} Department
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              • Your view is automatically scoped to <strong>{adminSubject}</strong> tests and exams created by you ({currentUser?.name}).
            </span>
          </div>
        </div>
      )}

      {/* Filter Toolbar Card */}
      <div className="glass-card" style={{ marginBottom: '1.75rem', padding: '1.25rem' }}>
        {/* Creator Tabs + Search row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          {/* Creator Scope Tabs */}
          <div style={{ display: 'flex', backgroundColor: 'var(--bg-primary)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <button
              onClick={() => setCreatorFilter('all')}
              style={{
                background: creatorFilter === 'all' ? 'var(--accent-blue)' : 'none',
                color: creatorFilter === 'all' ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              All Exams ({exams.length})
            </button>
            <button
              onClick={() => setCreatorFilter('mine')}
              style={{
                background: creatorFilter === 'mine' ? 'linear-gradient(135deg, #d97706, #f59e0b)' : 'none',
                color: creatorFilter === 'mine' ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                transition: 'all 0.15s'
              }}
            >
              <Sparkles size={13} /> My Created Exams ({myExamsCount})
            </button>
            <button
              onClick={() => setCreatorFilter('others')}
              style={{
                background: creatorFilter === 'others' ? 'var(--bg-secondary)' : 'none',
                color: creatorFilter === 'others' ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: creatorFilter === 'others' ? '1px solid var(--border-color)' : 'none',
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              Other Admins ({othersExamsCount})
            </button>
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', minWidth: '260px', flex: '1', maxWidth: '380px' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search by title, subject code, creator..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '2.4rem', fontSize: '0.825rem' }}
            />
            <Search size={15} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
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

        {/* Subject-Wise Category Pills Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '0.25rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Tag size={12} /> Subject Filter:
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
      </div>

      {/* Exams Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          Loading course bank...
        </div>
      ) : filteredExams.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3.5rem 2rem', color: 'var(--text-muted)' }}>
          <Layers size={36} style={{ margin: '0 auto 0.75rem auto', opacity: 0.4 }} />
          <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>No examinations match your filter</h3>
          <p style={{ fontSize: '0.825rem', marginBottom: '1.25rem' }}>
            {creatorFilter === 'mine'
              ? 'You have not created any exams yet under this category.'
              : 'Try clearing the search or switching the subject category tab.'}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
            <button
              onClick={() => { setSelectedCategory('all'); setCreatorFilter('all'); setSearchQuery(''); }}
              className="btn btn-secondary btn-sm"
            >
              Reset All Filters
            </button>
            <button onClick={() => setShowCreateModal(true)} className="btn btn-primary btn-sm">
              <Plus size={14} /> Create Examination
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
          {filteredExams.map(exam => {
            const isMine = isCreatedByMe(exam);
            return (
              <div
                key={exam.id}
                className="glass-card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  border: isMine ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid var(--border-color)',
                  boxShadow: isMine ? '0 4px 20px -2px rgba(245, 158, 11, 0.08)' : undefined
                }}
              >
                <div>
                  {/* Top Badges (Subject Code + Category + Duration) */}
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

                  <h3 style={{ fontSize: '1.15rem', marginBottom: '0.4rem', lineHeight: 1.3 }}>{exam.title}</h3>
                  <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginBottom: '1.1rem', minHeight: '36px' }}>
                    {exam.description}
                  </p>

                  {/* Creator Info Box */}
                  <div style={{
                    backgroundColor: isMine ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-secondary)',
                    border: isMine ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid var(--border-subtle)',
                    padding: '0.45rem 0.65rem',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    color: isMine ? '#fcd34d' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.85rem'
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {isMine ? <Sparkles size={12} color="#f59e0b" /> : <User size={12} />}
                      <span>{isMine ? <strong>Created by You</strong> : `Created by: ${exam.creator_name || 'Admin'}`}</span>
                    </span>
                    {isMine && <span style={{ fontSize: '0.68rem', backgroundColor: 'rgba(245, 158, 11, 0.2)', padding: '1px 6px', borderRadius: '4px', color: '#f59e0b', fontWeight: 600 }}>Your Exam</span>}
                  </div>
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
                    <span>Questions: <strong>{exam.questions_count || 0}</strong></span>
                    <span>Passing: <strong>{exam.passing_marks}%</strong></span>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => handleViewQuestions(exam.id)}
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1 }}
                    >
                      <FileQuestion size={14} /> Questions ({exam.questions_count || 0})
                    </button>
                    <button
                      onClick={() => handleDeleteExam(exam.id)}
                      className="btn btn-danger btn-sm"
                      style={{ padding: '0.4rem 0.6rem' }}
                      title="Delete Exam"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Exam Modal */}
      {showCreateModal && (
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
          <div className="glass-card" style={{ maxWidth: '540px', width: '100%', padding: '2rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid #475569' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '2px' }}>Create New Examination Course</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Will be authored under your administrator profile ({currentUser?.name})</span>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="btn btn-secondary btn-sm" style={{ padding: '0.35rem' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateExam}>
              <div className="form-group">
                <label className="form-label">Course Title</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. CS401: Deep Learning & Neural Networks"
                  value={newExam.title}
                  onChange={(e) => setNewExam({ ...newExam, title: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">Subject Code</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. CS401"
                    value={newExam.subject_code}
                    onChange={(e) => setNewExam({ ...newExam, subject_code: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Subject Category / Department</label>
                  <input
                    type="text"
                    list="category-suggestions"
                    required
                    className="form-input"
                    placeholder="e.g. Computer Science"
                    value={newExam.category}
                    onChange={(e) => setNewExam({ ...newExam, category: e.target.value })}
                  />
                  <datalist id="category-suggestions">
                    <option value="Computer Science" />
                    <option value="Artificial Intelligence" />
                    <option value="Cybersecurity" />
                    <option value="Data Science" />
                    <option value="Information Technology" />
                    <option value="Mathematics" />
                    <option value="Electrical Engineering" />
                  </datalist>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">Duration (Minutes)</label>
                  <input
                    type="number"
                    required
                    min="5"
                    max="180"
                    className="form-input"
                    value={newExam.duration_minutes}
                    onChange={(e) => setNewExam({ ...newExam, duration_minutes: parseInt(e.target.value) })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Passing Percentage (%)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="100"
                    className="form-input"
                    value={newExam.passing_marks}
                    onChange={(e) => setNewExam({ ...newExam, passing_marks: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Course Syllabus / Description</label>
                <textarea
                  required
                  rows="3"
                  className="form-input"
                  placeholder="Details on topics evaluated in this examination..."
                  value={newExam.description}
                  onChange={(e) => setNewExam({ ...newExam, description: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Total Marks</label>
                <input
                  type="number"
                  required
                  min="1"
                  className="form-input"
                  value={newExam.total_marks}
                  onChange={(e) => setNewExam({ ...newExam, total_marks: parseInt(e.target.value) })}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary btn-sm">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm">
                  <Save size={15} /> Save Examination
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Questions Modal */}
      {selectedExamForQuestions && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '1.5rem'
        }}>
          <div className="glass-card" style={{ maxWidth: '800px', width: '100%', maxHeight: '88vh', overflowY: 'auto', backgroundColor: 'var(--bg-secondary)', border: '1px solid #475569' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem' }}>MCQ Question Bank</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{selectedExamForQuestions.title} ({selectedExamForQuestions.subject_code})</span>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => setShowAddQuestionModal(true)} className="btn btn-primary btn-sm">
                  <Plus size={14} /> Add Question
                </button>
                <button onClick={() => setSelectedExamForQuestions(null)} className="btn btn-secondary btn-sm" style={{ padding: '0.35rem' }}>
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Questions List */}
            {selectedExamForQuestions.questions?.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                No questions added to this exam yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {selectedExamForQuestions.questions.map((q, idx) => (
                  <div key={q.id} style={{ backgroundColor: 'var(--bg-primary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-blue)' }}>
                        Q{idx + 1} (Marks: {q.marks || 1})
                      </span>
                      <button onClick={() => handleDeleteQuestion(q.id)} className="btn btn-danger btn-sm" style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}>
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>

                    <p style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>{q.question_text}</p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                      {q.options?.map((opt, oIdx) => {
                        const isCorrect = q.correct_answer === oIdx;
                        return (
                          <div
                            key={oIdx}
                            style={{
                              padding: '0.4rem 0.65rem',
                              borderRadius: '6px',
                              backgroundColor: isCorrect ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-secondary)',
                              border: `1px solid ${isCorrect ? '#10b981' : 'var(--border-subtle)'}`,
                              fontSize: '0.75rem',
                              color: isCorrect ? '#6ee7b7' : 'var(--text-secondary)'
                            }}
                          >
                            <strong>{String.fromCharCode(65 + oIdx)}:</strong> {opt} {isCorrect && '✓ (Correct)'}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Single Question Modal */}
      {showAddQuestionModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 110,
          padding: '1.5rem'
        }}>
          <div className="glass-card" style={{ maxWidth: '580px', width: '100%', padding: '2rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid #475569' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <h3 style={{ fontSize: '1.15rem' }}>Add New Multiple-Choice Question</h3>
              <button onClick={() => setShowAddQuestionModal(false)} className="btn btn-secondary btn-sm" style={{ padding: '0.35rem' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddQuestion}>
              <div className="form-group">
                <label className="form-label">Question Text</label>
                <textarea
                  required
                  rows="2"
                  className="form-input"
                  placeholder="Enter the question statement..."
                  value={newQuestion.question_text}
                  onChange={(e) => setNewQuestion({ ...newQuestion, question_text: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                {newQuestion.options.map((opt, oIdx) => (
                  <div key={oIdx} className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Option {String.fromCharCode(65 + oIdx)}</label>
                    <input
                      type="text"
                      required
                      className="form-input"
                      placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                      value={opt}
                      onChange={(e) => {
                        const newOpts = [...newQuestion.options];
                        newOpts[oIdx] = e.target.value;
                        setNewQuestion({ ...newQuestion, options: newOpts });
                      }}
                    />
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Correct Option</label>
                  <select
                    className="form-input"
                    value={newQuestion.correct_answer}
                    onChange={(e) => setNewQuestion({ ...newQuestion, correct_answer: parseInt(e.target.value) })}
                  >
                    <option value={0}>Option A</option>
                    <option value={1}>Option B</option>
                    <option value={2}>Option C</option>
                    <option value={3}>Option D</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Marks Value</label>
                  <input
                    type="number"
                    required
                    min="1"
                    className="form-input"
                    value={newQuestion.marks}
                    onChange={(e) => setNewQuestion({ ...newQuestion, marks: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Explanation / Solution Note (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Rationale for the correct choice..."
                  value={newQuestion.explanation}
                  onChange={(e) => setNewQuestion({ ...newQuestion, explanation: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                <button type="button" onClick={() => setShowAddQuestionModal(false)} className="btn btn-secondary btn-sm">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm">
                  <Save size={15} /> Save to Question Bank
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
