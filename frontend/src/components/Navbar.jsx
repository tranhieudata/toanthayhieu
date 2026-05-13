import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FiBook, FiUser, FiLogOut, FiSettings } from 'react-icons/fi';
import { useState } from 'react';

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center gap-2 font-bold text-xl text-blue-600">
            <FiBook className="text-2xl" />
            Toán Thầy Hiếu
          </Link>

          <div className="hidden md:flex items-center gap-6">
            <Link to="/courses" className="text-gray-600 hover:text-blue-600 transition-colors">Khóa học</Link>
            <Link to="/classes" className="text-gray-600 hover:text-blue-600 transition-colors">Lớp học</Link>
            {user && (
              <Link to="/dashboard" className="text-gray-600 hover:text-blue-600 transition-colors">Học của tôi</Link>
            )}
            {isAdmin && (
              <Link to="/admin" className="text-gray-600 hover:text-blue-600 transition-colors">Quản trị</Link>
            )}
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 hover:bg-gray-100 rounded-lg px-3 py-2 transition-colors"
                >
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium text-sm">
                      {user.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-700 hidden sm:block">{user.name}</span>
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-1">
                    <Link to="/dashboard" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setDropdownOpen(false)}>
                      <FiUser /> Tài khoản của tôi
                    </Link>
                    {isAdmin && (
                      <Link to="/admin" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setDropdownOpen(false)}>
                        <FiSettings /> Quản trị viên
                      </Link>
                    )}
                    <hr className="my-1" />
                    <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left">
                      <FiLogOut /> Đăng xuất
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link to="/login" className="btn-secondary text-sm">Đăng nhập</Link>
                <Link to="/register" className="btn-primary text-sm">Đăng ký</Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
