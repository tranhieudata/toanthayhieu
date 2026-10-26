import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FiCamera, FiUser, FiCalendar, FiLock, FiSave, FiEye, FiEyeOff } from 'react-icons/fi';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import { ThemeSettings } from '../components/ThemeControls';
import api, { getUploadUrl } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { compressImageFile } from '../utils/imageCompression';
import '../styles/community.css';
import '../styles/account-settings.css';

const message = e => e.response?.data?.message || 'Chưa thể lưu thay đổi. Vui lòng thử lại.';
export default function AccountSettingsPage() {
  const { user, updateUser, isAdmin } = useAuth();
  const location = useLocation();
  const [form, setForm] = useState({ name: user.name, dateOfBirth: user.dateOfBirth || '' });
  const [image, setImage] = useState(null), [preview, setPreview] = useState(''), [removeAvatar, setRemoveAvatar] = useState(false);
  const [saving, setSaving] = useState(false), [preparing, setPreparing] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingPassword, setSavingPassword] = useState(false), [showPassword, setShowPassword] = useState(false);
  const fileInput = useRef(), passwordSection = useRef(), selection = useRef(0);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  useEffect(() => { setForm({ name: user.name, dateOfBirth: user.dateOfBirth || '' }); }, [user.name, user.dateOfBirth]);
  useEffect(() => { if (location.hash === '#password') passwordSection.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [location.hash]);
  useEffect(() => {
    if (!image) { setPreview(''); return; }
    const url = URL.createObjectURL(image); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  useEffect(() => () => { ++selection.current; }, []);
  async function selectImage(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) return toast.error('Chọn ảnh JPEG, PNG hoặc WebP, tối đa 5 MB');
    const version = ++selection.current; setPreparing(true);
    try {
      const compressed = await compressImageFile(file, { maxSize: 512, quality: .85 });
      if (selection.current !== version) return;
      setImage(compressed); setRemoveAvatar(false);
    } finally { if (selection.current === version) setPreparing(false); }
  }
  async function saveProfile(event) {
    event.preventDefault(); if (preparing || saving) return;
    setSaving(true);
    try {
      const data = new FormData(); data.append('name', form.name.trim()); data.append('dateOfBirth', form.dateOfBirth);
      data.append('removeAvatar', String(removeAvatar)); if (image) data.append('avatar', image);
      const r = await api.put('/auth/me', data);
      updateUser(r.data.user); setImage(null); setRemoveAvatar(false);
      toast.success('Đã cập nhật tên hiển thị, ảnh và ngày sinh');
    } catch (e) { toast.error(message(e)); } finally { setSaving(false); }
  }
  async function savePassword(event) {
    event.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) return toast.error('Xác nhận mật khẩu chưa khớp');
    if (passwords.newPassword.length < 6 || new TextEncoder().encode(passwords.newPassword).length > 72) return toast.error('Mật khẩu cần ít nhất 6 ký tự và tối đa 72 byte');
    setSavingPassword(true);
    try {
      await api.put('/auth/change-password', { currentPassword: passwords.currentPassword, newPassword: passwords.newPassword });
      updateUser({ _id: user._id, hasPassword: true }); setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' }); setShowPassword(false);
      toast.success('Đã cập nhật mật khẩu');
    } catch (e) { toast.error(message(e)); } finally { setSavingPassword(false); }
  }
  const avatarUrl = preview || (!removeAvatar && getUploadUrl(user.avatar));
  return <div className="community-locket account-settings"><Navbar /><main className="account-main">
    <div className="locket-page-heading"><div><p>MỘT CHÚT VỀ BẠN</p><h1>Cài đặt tài khoản</h1></div><Link className="text-sm text-blue-600" to={isAdmin ? '/admin' : '/dashboard'}>← Quay lại</Link></div>
    <ThemeSettings />
    <form onSubmit={saveProfile} className="account-profile-layout">
      <section className="community-panel account-avatar-panel"><span className="account-section-icon"><FiCamera /></span><h2>Ảnh đại diện</h2>
        <div className="account-avatar-preview">{avatarUrl ? <img src={avatarUrl} alt="Ảnh đại diện xem trước" /> : <span>{form.name.trim().charAt(0).toUpperCase() || '?'}</span>}</div>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Chọn ảnh đại diện" onChange={selectImage} disabled={saving || preparing} />
        <button type="button" className="community-button" disabled={saving || preparing} onClick={() => fileInput.current?.click()}><FiCamera /> {preparing ? 'Đang chuẩn bị ảnh…' : 'Chọn ảnh mới'}</button>
        {(user.avatar || image) && <button type="button" className="account-remove-avatar" disabled={saving || preparing} onClick={() => { setImage(null); setRemoveAvatar(true); }}>Gỡ ảnh đại diện</button>}
        <p>JPEG, PNG hoặc WebP · tối đa 5 MB.<br />Ảnh mới sẽ được lưu khi bạn bấm lưu thông tin.</p>
      </section>
      <section className="community-panel account-information"><div className="account-section-heading"><span className="account-section-icon"><FiUser /></span><div><h2>Thông tin cá nhân</h2><p>Tên và ảnh sẽ hiển thị trên bảng tin, lời mời và trò chuyện.</p></div></div>
        <label className="account-field" htmlFor="display-name">Tên hiển thị<input id="display-name" className="community-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required maxLength={80} autoComplete="name" disabled={saving} /></label>
        <label className="account-field" htmlFor="birth-date"><span><FiCalendar /> Ngày, tháng, năm sinh</span><input id="birth-date" type="date" className="community-input" value={form.dateOfBirth} min="1900-01-01" max={today} onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} autoComplete="bday" disabled={saving} /></label>
        <p className="account-field-note">Ngày sinh không hiển thị trên bảng tin hoặc danh sách bạn bè. Có thể để trống nếu chưa muốn cập nhật.</p>
        <div className="account-login-identity"><span>Email đăng nhập</span><b>{user.email}</b><small>{isAdmin ? 'Quản trị viên' : 'Học sinh'}</small></div>
        <button className="community-button account-save" disabled={saving || preparing}><FiSave /> {saving ? 'Đang lưu…' : 'Lưu thông tin'}</button>
      </section>
    </form>
    <section ref={passwordSection} id="password" className="community-panel account-password-panel"><div className="account-section-heading"><span className="account-section-icon"><FiLock /></span><div><h2>{user.hasPassword === false ? 'Đặt mật khẩu đăng nhập' : 'Đổi mật khẩu'}</h2><p>{user.hasPassword === false ? 'Tài khoản đăng nhập bằng Google/Facebook có thể đặt thêm mật khẩu để đăng nhập bằng email.' : 'Nhập mật khẩu hiện tại để xác nhận thay đổi.'}</p></div></div>
      <form onSubmit={savePassword}><div className="account-password-fields">
        {(user.hasPassword !== false ? [['currentPassword', 'Mật khẩu hiện tại', 'current-password'], ['newPassword', 'Mật khẩu mới', 'new-password'], ['confirmPassword', 'Nhập lại mật khẩu mới', 'new-password']] : [['newPassword', 'Mật khẩu mới', 'new-password'], ['confirmPassword', 'Nhập lại mật khẩu mới', 'new-password']]).map(([key, label, autocomplete]) => <label className="account-field" key={key} htmlFor={key}>{label}<input id={key} type={showPassword ? 'text' : 'password'} className="community-input" value={passwords[key]} onChange={e => setPasswords(p => ({ ...p, [key]: e.target.value }))} autoComplete={autocomplete} required minLength={key === 'currentPassword' ? undefined : 6} maxLength={72} disabled={savingPassword} /></label>)}
      </div><div className="account-password-footer"><button type="button" aria-pressed={showPassword} className="account-show-password" onClick={() => setShowPassword(v => !v)}>{showPassword ? <FiEyeOff /> : <FiEye />} {showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}</button><button className="community-button" disabled={savingPassword}><FiLock /> {savingPassword ? 'Đang lưu…' : 'Lưu mật khẩu mới'}</button></div><p className="account-field-note">Mật khẩu cần ít nhất 6 ký tự. Đừng dùng ngày sinh làm mật khẩu nhé.</p></form>
    </section>
  </main></div>;
}
