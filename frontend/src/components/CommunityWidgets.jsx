import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiBell } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api, { getUploadUrl } from '../api/axios';
import { useCommunity } from '../context/CommunityContext';
import CommunityAccessNotice from './CommunityAccessNotice';
export function CommunityImage({ post, className = '' }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true, objectUrl;
    api.get(`/community/posts/${post}/image`, { responseType: 'blob' }).then(({ data }) => {
      objectUrl = URL.createObjectURL(data); if (active) setUrl(objectUrl);
    }).catch(() => {});
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [post]);
  return url ? <img src={url} alt="Ảnh học tập" className={className} /> : <div className={`bg-gray-100 p-4 text-sm text-gray-500 ${className}`}>Đang tải ảnh…</div>;
}
export function Avatar({ person, frame = '' }) {
  return <span className={`inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-full bg-blue-100 text-blue-700 font-bold overflow-hidden ${frame === 'frame-green' ? 'ring-4 ring-emerald-300' : ''}`}>
    {person?.avatar ? <img src={getUploadUrl(person.avatar)} alt="" className="w-full h-full object-cover" /> : person?.name?.charAt(0) || '?'}
  </span>;
}
export function NotificationBell() {
  const { notifications, inbox, refresh, friendships } = useCommunity();
  const [open, setOpen] = useState(false);
  const count = inbox.reduce((n, item) => n + item.count, 0);
  const badgeCount = Math.max(notifications.unread + count, friendships.incoming.length);
  return <div className="relative">
    <button aria-label="Thông báo" aria-expanded={open} className="relative p-2 text-gray-600 hover:bg-blue-50 rounded-full" onClick={() => { if (!open) refresh(); setOpen(v => !v); }}>
      <FiBell size={22} />{badgeCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full px-1 text-xs">{Math.min(99, badgeCount)}</span>}
    </button>
    {open && <><button className="fixed inset-0 z-40 cursor-default" aria-label="Đóng thông báo" onClick={() => setOpen(false)} /><div className="absolute right-0 top-12 w-[min(22rem,90vw)] bg-white border shadow-xl rounded-xl z-50 max-h-96 overflow-auto p-3">
      <div className="flex justify-between items-center mb-3"><b>Thông báo</b><button className="text-xs text-blue-600" onClick={async () => { try { await api.post('/community/notifications/read'); refresh(); } catch (e) { toast.error(e.response?.data?.message || 'Chưa thể cập nhật thông báo'); } }}>Đánh dấu đã đọc</button></div>
      {friendships.incoming.length > 0 && <Link onClick={() => setOpen(false)} className="block p-3 bg-blue-50 rounded-lg mb-2 font-medium text-sm" to="/community?tab=friends">💛 {friendships.incoming.length} lời mời kết bạn · Xem và chấp nhận →</Link>}
      {count > 0 && <Link onClick={() => setOpen(false)} className="block p-3 bg-blue-50 rounded-lg mb-2" to="/community?tab=chat">Bạn có {count} tin nhắn mới</Link>}
      {!notifications.items.length && <p className="text-sm text-gray-500 p-3">Chưa có thông báo.</p>}
      {notifications.items.map(n => <Link key={n._id} onClick={() => setOpen(false)} to={n.kind === 'friendship' ? '/community?tab=friends' : n.post ? `/community?post=${n.post}` : '/community?tab=garden'} className={`block p-3 text-sm rounded-lg mb-1 ${n.readAt ? 'text-gray-500' : 'bg-blue-50 text-gray-900'}`}>
        {n.text}<small className="block text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString('vi-VN')}</small>
      </Link>)}
    </div></>}
  </div>;
}
export function CommunityDashboard() {
  const { access } = useCommunity();
  const [stories, setStories] = useState([]), [garden, setGarden] = useState(null), [error, setError] = useState(false);
  useEffect(() => {
    if (!access?.allowed) { setStories([]); setGarden(null); return; }
    let active = true;
    setError(false);
    Promise.all([api.get('/community/stories'), api.get('/community/garden')]).then(([s, g]) => { if (active) { setStories(s.data); setGarden(g.data); } }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [access?.allowed]);
  if (!access?.allowed) return <div className="mb-8"><CommunityAccessNotice compact /></div>;
  return <section className="community-dashboard-widgets mb-8 grid md:grid-cols-3 gap-4">
    <div className="md:col-span-2 bg-[#1d1d1b] text-[#f6f5ee] rounded-3xl border border-[#32322e] p-5">
      <div className="flex justify-between gap-2 items-center"><h2 className="font-bold text-lg">💛 Góc nhỏ của chúng mình</h2><Link to="/community" className="text-sm text-[#ffda45]">Mở góc nhỏ →</Link></div>
      <p className="text-sm text-[#a5a59a] mt-1">Một khoảnh khắc học tập, một lời cổ vũ. Tin hiển thị trong 24 giờ.</p>
      <div className="flex gap-3 overflow-x-auto mt-4 pb-2">
        <Link to="/community?compose=story" className="shrink-0 w-24 rounded-2xl bg-[#2a291f] border border-dashed border-[#6c6140] p-3 text-center"><span className="block text-3xl text-[#ffda45]">＋</span><span className="text-xs font-medium">Tạo Tin</span></Link>
        {stories.slice(0, 6).map(s => <Link to={`/community?post=${s._id}`} key={s._id} className="shrink-0 w-24 p-2 rounded-2xl bg-[#292923] text-center border border-[#74662f]"><div className="flex justify-center mb-2"><Avatar person={s.author} frame={s.frame} /></div><span className="text-xs line-clamp-2">{s.author?.name}</span></Link>)}
        {!stories.length && !error && <p className="text-sm text-gray-400 self-center">Chia sẻ Tin học tập đầu tiên hôm nay!</p>}
        {error && <p className="text-sm text-red-500">Chưa tải được dữ liệu cộng đồng.</p>}
      </div>
    </div>
    <Link to="/community?tab=garden" className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
      <div className="flex items-center gap-3"><span className="text-5xl">{garden?.growth >= 20 ? '🌳' : garden?.growth >= 7 ? '🌿' : '🌱'}</span><div><h2 className="font-bold text-emerald-900">Mầm cây của bạn</h2><p className="text-sm text-emerald-700">{garden ? `${garden.energy} ⚡ · ${garden.growth} ngày chăm cây` : 'Cùng học, cùng lớn lên'}</p></div></div>
      <p className="mt-4 text-sm text-emerald-800">{garden?.needsWater ? 'Cây cần nước! Hoàn thành nhiệm vụ ôn tập nhé.' : 'Hoàn thành bài tập để nuôi cây mỗi ngày.'}</p>
    </Link>
  </section>;
}
