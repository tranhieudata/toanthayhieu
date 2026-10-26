import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CommunityProvider } from './context/CommunityContext';
import { ThemeProvider } from './context/ThemeContext';
import CommunityPage from './pages/CommunityPage';
import AdminCommunity from './pages/admin/AdminCommunity';

// Public pages
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import CourseDetailPage from './pages/CourseDetailPage';
import LessonPage from './pages/LessonPage';
import LessonDetailPage from './pages/LessonDetailPage';
import ExercisePage from './pages/ExercisePage';
import OAuthSuccess from './pages/OAuthSuccess';
import DashboardPage from './pages/DashboardPage';
import ClassesPage from './pages/ClassesPage';
import ClassDetailPage from './pages/ClassDetailPage';
import StudentHomeworkPage from './pages/StudentHomeworkPage';
import AccountSettingsPage from './pages/AccountSettingsPage';
import PublicHomeworkPrintPage from './pages/PublicHomeworkPrintPage';

// Admin pages
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminStudents from './pages/admin/AdminStudents';
import AdminClasses from './pages/admin/AdminClasses';
import AdminEnrollments from './pages/admin/AdminEnrollments';
import AdminContentManager from './pages/admin/AdminContentManager';
import AdminTuition from './pages/admin/AdminTuition';
import AdminRevenue from './pages/admin/AdminRevenue';
import AdminSettings from './pages/admin/AdminSettings';
import AdminLessons from './pages/admin/AdminLessons';
import AdminLessonEditor from './pages/admin/AdminLessonEditor';
import AdminExams from './pages/admin/AdminExams';
import AdminExamEditor from './pages/admin/AdminExamEditor';
import AdminHomework from './pages/admin/AdminHomework';
import AdminTeachingSessions from './pages/admin/AdminTeachingSessions';
import StudentExamsPage from './pages/StudentExamsPage';
import StudentExamDetailPage from './pages/StudentExamDetailPage';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  return user ? children : <Navigate to="/login" />;
};

const AdminRoute = ({ children }) => {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  if (!user) return <Navigate to="/login" />;
  if (!isAdmin) return <Navigate to="/" />;
  return children;
};

const GuestHomeRoute = () => {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  if (user) return <Navigate to={isAdmin ? '/admin' : '/dashboard'} replace />;
  return <HomePage />;
};

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
      <CommunityProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ style: { background: 'var(--theme-surface)', color: 'var(--theme-text)', border: '1px solid var(--theme-border)' } }} />
        <Routes>
          <Route path="/" element={<GuestHomeRoute />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/classes" element={<ClassesPage />} />
          <Route path="/print/homework/:token" element={<PublicHomeworkPrintPage />} />
          <Route path="/courses/:id" element={<CourseDetailPage />} />
          <Route path="/oauth-success" element={<OAuthSuccess />} />
          <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
          <Route path="/community" element={<PrivateRoute><CommunityPage /></PrivateRoute>} />
          <Route path="/account" element={<PrivateRoute><AccountSettingsPage /></PrivateRoute>} />
          <Route path="/change-password" element={<PrivateRoute><Navigate to="/account#password" replace /></PrivateRoute>} />
          <Route path="/class/:classId" element={<PrivateRoute><ClassDetailPage /></PrivateRoute>} />
          <Route path="/lesson/:lessonId" element={<PrivateRoute><LessonDetailPage /></PrivateRoute>} />
          <Route path="/lessons/:id" element={<PrivateRoute><LessonPage /></PrivateRoute>} />
          <Route path="/exercises/:id" element={<PrivateRoute><ExercisePage /></PrivateRoute>} />
          <Route path="/homeworks" element={<PrivateRoute><StudentHomeworkPage /></PrivateRoute>} />
          <Route path="/exams" element={<PrivateRoute><StudentExamsPage /></PrivateRoute>} />
          <Route path="/exams/:id" element={<PrivateRoute><StudentExamDetailPage /></PrivateRoute>} />
          <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="content" element={<AdminContentManager />} />
            <Route path="lessons" element={<AdminLessons />} />
            <Route path="lessons/new" element={<AdminLessonEditor />} />
            <Route path="lessons/:id/edit" element={<AdminLessonEditor />} />
            <Route path="lessons/:id" element={<AdminLessonEditor />} />
            <Route path="students" element={<AdminStudents />} />
            <Route path="classes" element={<AdminClasses />} />
            <Route path="teaching-sessions" element={<AdminTeachingSessions />} />
            <Route path="enrollments" element={<AdminEnrollments />} />
            <Route path="exams" element={<AdminExams />} />
            <Route path="exams/new" element={<AdminExamEditor />} />
            <Route path="exams/:id/edit" element={<AdminExamEditor />} />
            <Route path="homeworks" element={<AdminHomework />} />
            <Route path="tuition" element={<AdminTuition />} />
            <Route path="revenue" element={<AdminRevenue />} />
            <Route path="settings" element={<AdminSettings />} />
            <Route path="community" element={<AdminCommunity />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </CommunityProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
