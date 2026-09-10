import React, { useState, useEffect } from 'react';
import { auth } from './services/auth';
import { api } from './services/api';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminRegister from './pages/AdminRegister';
import StudentDashboard from './pages/StudentDashboard';
import SystemCheckPage from './pages/SystemCheckPage';
import ExamSessionPage from './pages/ExamSessionPage';
import ExamResultPage from './pages/ExamResultPage';
import AdminDashboard from './pages/AdminDashboard';
import AdminLiveMonitor from './pages/AdminLiveMonitor';
import AdminExams from './pages/AdminExams';
import AdminReportView from './pages/AdminReportView';
import ProfileEditor from './pages/ProfileEditor';

export default function App() {
  const [currentUser, setCurrentUser] = useState(auth.getUser());
  const [currentRoute, setCurrentRoute] = useState(
    currentUser ? (currentUser.role === 'admin' ? 'admin-dashboard' : 'student-dashboard') : 'login'
  );
  
  // Examination flow state
  const [selectedExam, setSelectedExam] = useState(null);
  const [activeAttempt, setActiveAttempt] = useState(null);
  const [activeAttemptId, setActiveAttemptId] = useState(null);

  useEffect(() => {
    const user = auth.getUser();
    setCurrentUser(user);
    if (!user && currentRoute !== 'register') {
      setCurrentRoute('login');
    }
  }, []);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    if (user.role === 'admin') {
      setCurrentRoute('admin-dashboard');
    } else {
      setCurrentRoute('student-dashboard');
    }
  };

  const handleRegisterSuccess = (user) => {
    setCurrentUser(user);
    setCurrentRoute('student-dashboard');
  };

  const handleStartPreExamCheck = (exam) => {
    setSelectedExam(exam);
    setCurrentRoute('system-check');
  };

  const handleSystemCheckSuccess = async (faceRef) => {
    try {
      // Call backend to start exam attempt
      const res = await api.post('/attempts/start', {
        exam_id: selectedExam.id,
        verified_face_reference: faceRef
      });
      setActiveAttempt(res.attempt);
      setSelectedExam(res.exam);
      setCurrentRoute('exam-session');
    } catch (err) {
      alert(err.message || 'Failed to initialize exam attempt');
    }
  };

  const handleExamSubmitted = (attemptResult) => {
    const attId = attemptResult?.id || attemptResult?._id || activeAttempt?.id || activeAttempt?._id;
    setActiveAttemptId(attId);
    setCurrentRoute('exam-result');
  };

  const handleViewReport = (attemptId) => {
    setActiveAttemptId(attemptId);
    setCurrentRoute('report-view');
  };

  const handleUserUpdated = (updatedUser) => {
    setCurrentUser(updatedUser);
  };

  const renderContent = () => {
    if (!currentUser) {
      if (currentRoute === 'register') {
        return (
          <Register
            onRegisterSuccess={handleRegisterSuccess}
            navigateToLogin={() => setCurrentRoute('login')}
          />
        );
      }
      if (currentRoute === 'admin-register') {
        return (
          <AdminRegister
            onRegisterSuccess={handleLoginSuccess}
            navigateToLogin={() => setCurrentRoute('login')}
          />
        );
      }
      return (
        <Login
          onLoginSuccess={handleLoginSuccess}
          navigateToRegister={() => setCurrentRoute('register')}
          navigateToAdminRegister={() => setCurrentRoute('admin-register')}
        />
      );
    }

    switch (currentRoute) {
      // Profile Route (Available to both students and admins)
      case 'profile':
        return (
          <ProfileEditor
            onBack={() => setCurrentRoute(currentUser.role === 'admin' ? 'admin-dashboard' : 'student-dashboard')}
            onUserUpdated={handleUserUpdated}
          />
        );

      // Student Routes
      case 'student-dashboard':
        return (
          <StudentDashboard
            onSelectExam={handleStartPreExamCheck}
            onViewResult={(attId) => handleViewReport(attId)}
            onOpenProfile={() => setCurrentRoute('profile')}
          />
        );

      case 'system-check':
        return (
          <SystemCheckPage
            exam={selectedExam}
            onSystemCheckSuccess={handleSystemCheckSuccess}
            onCancel={() => setCurrentRoute('student-dashboard')}
          />
        );

      case 'exam-session':
        return (
          <ExamSessionPage
            exam={selectedExam}
            attempt={activeAttempt}
            onExamSubmitted={handleExamSubmitted}
          />
        );

      case 'exam-result':
        return (
          <ExamResultPage
            attemptId={activeAttemptId}
            onViewDetailedReport={(attId) => handleViewReport(attId)}
            onReturnDashboard={() => setCurrentRoute('student-dashboard')}
          />
        );

      // Admin Routes
      case 'admin-dashboard':
        return (
          <AdminDashboard
            onSelectReport={(attId) => handleViewReport(attId)}
            onGoLive={() => setCurrentRoute('admin-live')}
            onOpenProfile={() => setCurrentRoute('profile')}
          />
        );

      case 'admin-live':
        return (
          <AdminLiveMonitor
            onSelectReport={(attId) => handleViewReport(attId)}
          />
        );

      case 'admin-exams':
        return <AdminExams />;

      case 'report-view':
        return (
          <AdminReportView
            attemptId={activeAttemptId}
            onBack={() => setCurrentRoute(currentUser.role === 'admin' ? 'admin-dashboard' : 'student-dashboard')}
          />
        );

      default:
        return (
          <StudentDashboard
            onSelectExam={handleStartPreExamCheck}
            onViewResult={(attId) => handleViewReport(attId)}
            onOpenProfile={() => setCurrentRoute('profile')}
          />
        );
    }
  };

  const isExamInProgress = currentRoute === 'exam-session';

  return (
    <div className="app-container">
      {/* Hide navbar during active fullscreen examination for zero distractions */}
      {!isExamInProgress && (
        <Navbar
          currentRoute={currentRoute}
          setCurrentRoute={setCurrentRoute}
        />
      )}
      {renderContent()}
    </div>
  );
}
