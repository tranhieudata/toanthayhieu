import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';

// Public pages
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import CoursesPage from './pages/CoursesPage';
import CourseDetailPage from './pages/CourseDetailPage';
import LessonPage from './pages/LessonPage';
import ExercisePage from './pages/ExercisePage';
import OAuthSuccess from './pages/OAuthSuccess';
import DashboardPage from './pages/DashboardPage';

// Admin pages
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminStudents from './pages/admin/AdminStudents';
import AdminClasses from './pages/admin/AdminClasses';
import AdminEnrollments from './pages/admin/AdminEnrollments';
import AdminContentManager from './pages/admin/AdminContentManager';
import AdminLessonEditor from './pages/admin/AdminLessonEditor';
import ClassesPage from './pages/ClassesPage';

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

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/courses" element={<CoursesPage />} />
          <Route path="/courses/:id" element={<CourseDetailPage />} />
          <Route path="/oauth-success" element={<OAuthSuccess />} />
          <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
          <Route path="/classes" element={<PrivateRoute><ClassesPage /></PrivateRoute>} />
          <Route path="/lessons/:id" element={<PrivateRoute><LessonPage /></PrivateRoute>} />
          <Route path="/exercises/:id" element={<PrivateRoute><ExercisePage /></PrivateRoute>} />
          <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="content" element={<AdminContentManager />} />
            <Route path="lessons/new" element={<AdminLessonEditor />} />
            <Route path="lessons/:id/edit" element={<AdminLessonEditor />} />
            <Route path="students" element={<AdminStudents />} />
            <Route path="classes" element={<AdminClasses />} />
            <Route path="enrollments" element={<AdminEnrollments />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
