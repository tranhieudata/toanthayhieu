import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { FiBookOpen, FiClipboard, FiHeart, FiHome, FiLayers, FiLock, FiLogOut, FiSettings, FiUser, FiUsers, FiChevronDown } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { ThemeToggle } from './ThemeControls';
import { useCommunity } from '../context/CommunityContext';
import { Avatar, NotificationBell } from './CommunityWidgets';
import '../styles/student-navigation.css';

export default function Navbar({ homeNavigation = false }) {
  const { user, logout, isAdmin } = useAuth();
  const { friendships } = useCommunity();
  const location = useLocation(), navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const tabs = user ? [
    { to: '/dashboard', label: 'Tổng quan', icon: FiHome, active: location.pathname === '/dashboard' && location.hash !== '#my-classes' },
    { to: '/community', label: 'Cộng đồng', icon: FiHeart, active: location.pathname.startsWith('/community') },
    ...(!isAdmin ? [{ to: '/homeworks', label: 'Bài tập', icon: FiBookOpen, active: location.pathname.startsWith('/homeworks') }] : []),
    { to: '/classes', label: 'Lớp học', icon: FiLayers, active: location.pathname === '/classes' || location.pathname.startsWith('/class/') || location.pathname.startsWith('/lesson') },
    ...(!isAdmin ? [{ to: '/dashboard#my-classes', label: 'Lớp học của tôi', icon: FiUsers, active: location.pathname === '/dashboard' && location.hash === '#my-classes' }] : []),
    ...(!isAdmin ? [{ to: '/exams', label: 'Đề kiểm tra', icon: FiClipboard, active: location.pathname.startsWith('/exams') }] : [{ to: '/admin', label: 'Quản trị', icon: FiSettings, active: location.pathname.startsWith('/admin') }]),
  ] : [{ to: '/classes', label: 'Lớp học', icon: FiLayers, active: location.pathname === '/classes' }];
  useEffect(() => { setDropdownOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!dropdownOpen) return;
    const close = event => { if (event.key === 'Escape') setDropdownOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [dropdownOpen]);
  return <header className="student-topbar" data-theme={dark ? 'dark' : 'light'}>
    <div className="student-topbar-inner">
      <div className="student-topbar-main">
        <Link to={user ? '/dashboard' : '/'} className="student-school-brand">
          <span className="student-school-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48" focusable="false">
              <g fill="#fff" fillOpacity=".3"><rect x="6" y="6" width="16" height="16" rx="5" /><rect x="26" y="6" width="16" height="16" rx="5" /><rect x="6" y="26" width="16" height="16" rx="5" /><rect x="26" y="26" width="16" height="16" rx="5" /></g>
              <g stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 14h8M14 10v8M30 14h8M11 31l6 6M17 31l-6 6M30 34h8" />
                <circle cx="34" cy="30" r="1.2" fill="currentColor" stroke="none" /><circle cx="34" cy="38" r="1.2" fill="currentColor" stroke="none" />
              </g>
            </svg>
          </span>
          <span>Toán Thầy Hiếu<small>Học cùng nhau, lớn cùng nhau.</small></span>
        </Link>
        <div className="student-topbar-actions">
          {user && <ThemeToggle />}
          {user && friendships.incoming.length > 0 && <Link to="/community?tab=friends" aria-label={`${friendships.incoming.length} lời mời kết bạn`} className="student-invitation-link"><FiUsers /><span>{friendships.incoming.length}<span className="student-invitation-label"> lời mời</span></span></Link>}
          {user && <NotificationBell />}
          {user ? <div className="student-account-menu">
            <button aria-label="Menu tài khoản" aria-expanded={dropdownOpen} onClick={() => setDropdownOpen(v => !v)} className="student-account-trigger"><Avatar person={user} /><span className="student-account-name">{user.name}</span><FiChevronDown className="student-account-chevron" /></button>
            {dropdownOpen && <><button className="student-menu-backdrop" aria-label="Đóng menu tài khoản" onClick={() => setDropdownOpen(false)} /><div className="student-account-dropdown">
              <div className="student-menu-identity"><b>{user.name}</b><small>{user.email}</small></div>
              <Link to="/dashboard"><FiHome /> Tổng quan học tập</Link>
              <Link to={`/community?author=${user._id}`}><FiUser /> Tường của tôi</Link>
              <Link to="/account"><FiSettings /> Cài đặt tài khoản</Link>
              <Link to="/community?tab=friends"><FiUsers /> Bạn bè & lời mời</Link>
              {isAdmin && <Link to="/admin"><FiSettings /> Quản trị viên</Link>}
              <Link to="/account#password"><FiLock /> Đổi mật khẩu</Link>
              <button className="student-logout" onClick={() => { logout(); navigate('/login'); }}><FiLogOut /> Đăng xuất</button>
            </div></>}
          </div> : <div className="student-guest-actions"><Link to="/login">Đăng nhập</Link><Link className="student-register" to="/register">Đăng ký</Link></div>}
        </div>
      </div>
      <nav className="student-primary-tabs" aria-label={homeNavigation && !user ? 'Khám phá Toán Thầy Hiếu' : 'Điều hướng học sinh'}>{homeNavigation && !user ? <><a className="student-primary-tab" href="#cach-hoc">Cách học cùng thầy</a><a className="student-primary-tab" href="#lop-hoc">Lớp học</a><a className="student-primary-tab" href="#bat-dau">Hướng dẫn bắt đầu</a></> : tabs.map(({ to, label, icon: Icon, active }) => <Link key={to} to={to} aria-current={active ? 'page' : undefined} className={`student-primary-tab ${active ? 'is-active' : ''}`}><Icon /><span>{label}</span></Link>)}</nav>
    </div>
  </header>;
}
