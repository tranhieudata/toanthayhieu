import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FiHome, FiBook, FiUsers, FiLayers, FiCalendar, FiFileText, FiLogOut, FiMenu, FiX, FiCheckSquare, FiFile, FiDollarSign, FiSettings, FiTrendingUp, FiClipboard } from 'react-icons/fi';
import { useState } from 'react';

const navItems = [
  { to: '/admin', icon: <FiHome />, label: 'Tổng quan', exact: true },
  { to: '/admin/content', icon: <FiFile />, label: 'Quản lý nội dung' },
  { to: '/admin/students', icon: <FiUsers />, label: 'Học sinh' },
  { to: '/admin/classes', icon: <FiCalendar />, label: 'Lớp học' },
  { to: '/admin/enrollments', icon: <FiCheckSquare />, label: 'Đơn xét duyệt' },
  { to: '/admin/exams', icon: <FiClipboard />, label: 'Đề kiểm tra' },
  { to: '/admin/tuition', icon: <FiDollarSign />, label: 'Tính học phí' },
  { to: '/admin/revenue', icon: <FiTrendingUp />, label: 'Sổ doanh thu' },
  { to: '/admin/settings', icon: <FiSettings />, label: 'Cài đặt' },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (to, exact) => exact ? location.pathname === to : location.pathname.startsWith(to) && to !== '/admin';
  const isAdminExact = location.pathname === '/admin';

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-gray-900 text-white transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:block`}>
        <div className="p-6 border-b border-gray-700">
          <Link to="/" className="text-xl font-bold text-blue-400">Toán Thầy Hiếu</Link>
          <p className="text-xs text-gray-400 mt-1">Quản trị viên</p>
        </div>
        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const active = item.exact ? isAdminExact : isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${active ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}
              >
                {item.icon} {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-medium">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-medium text-white">{user?.name}</div>
              <div className="text-xs text-gray-400">Admin</div>
            </div>
          </div>
          <button onClick={logout} className="flex items-center gap-2 text-gray-400 hover:text-red-400 text-sm w-full">
            <FiLogOut /> Đăng xuất
          </button>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm px-6 py-4 flex items-center gap-4">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-gray-500">
            <FiMenu className="text-xl" />
          </button>
          <h2 className="font-semibold text-gray-900">Quản trị hệ thống</h2>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
