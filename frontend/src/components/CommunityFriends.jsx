import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useCommunity } from '../context/CommunityContext';
import { Avatar } from './CommunityWidgets';

export function FriendshipActions({ person }) {
  const { user } = useAuth();
  const { friendships, friendshipsReady, refresh } = useCommunity();
  const [busy, setBusy] = useState(false);
  if (!person || person._id === user._id) return null;
  const friend = friendships.friends.some(p => p._id === person._id);
  const incoming = friendships.incoming.some(p => p._id === person._id);
  const outgoing = friendships.outgoing.some(p => p._id === person._id);
  async function act(action) {
    setBusy(true);
    try {
      if (action === 'remove') await api.delete(`/community/friends/${person._id}`);
      else await api.post(`/community/friends/${person._id}/${action}`);
      await refresh();
      toast.success(action === 'request' ? 'Đã gửi lời mời kết bạn' : action === 'accept' ? 'Đã kết bạn. Hai bạn có thể trò chuyện!' : 'Đã cập nhật danh sách bạn bè');
    } catch (e) { toast.error(e.response?.data?.message || 'Chưa thể cập nhật kết bạn'); await refresh(); }
    finally { setBusy(false); }
  }
  return <div className="community-friend-actions">
    <span className={person.role === 'admin' ? 'friend-role-admin' : 'friend-role-student'}>{person.role === 'admin' ? 'Quản trị viên' : 'Học sinh'}</span>
    {friend ? <><Link to={`/community?tab=chat&peer=${person._id}`}>Nhắn tin</Link><button disabled={busy} className="friend-secondary" onClick={() => act('remove')}>Hủy kết bạn</button></>
      : incoming ? <><button disabled={busy} onClick={() => act('accept')}>Chấp nhận</button><button className="friend-secondary" disabled={busy} onClick={() => act('remove')}>Từ chối</button></>
        : outgoing ? <><span>Đã gửi lời mời</span><button disabled={busy} className="friend-secondary" onClick={() => act('remove')}>Thu hồi</button></>
          : <button disabled={busy || !friendshipsReady} onClick={() => act('request')}>＋ Kết bạn</button>}
  </div>;
}

export function FriendRequests({ showEmpty = false, incomingOnly = false }) {
  const { friendships, friendshipsReady, friendshipsError, refresh } = useCommunity();
  if (!showEmpty && !friendshipsError && !friendships.incoming.length && (incomingOnly || !friendships.outgoing.length)) return null;
  return <section className="community-friend-requests" aria-label="Lời mời kết bạn">
    <div className="flex items-center justify-between gap-3 mb-3"><b className="text-sm">Lời mời kết bạn</b><button className="text-xs text-blue-600" onClick={refresh}>Làm mới</button></div>
    {friendshipsError && <p role="alert" className="text-sm text-red-500 mb-3">{friendshipsError}</p>}
    {showEmpty && !friendshipsReady && !friendshipsError && <p className="text-sm text-gray-500">Đang tải lời mời…</p>}
    {showEmpty && friendshipsReady && !friendships.incoming.length && <p className="text-sm text-gray-500">Bạn chưa có lời mời kết bạn mới.</p>}
    {friendships.incoming.length > 0 && <><h3>Lời mời kết bạn ({friendships.incoming.length})</h3>{friendships.incoming.map(p => <div className="community-friend-request" key={p._id}><Avatar person={p} /><div className="min-w-0"><b>{p.name}</b><FriendshipActions person={p} /></div></div>)}</>}
    {!incomingOnly && friendships.outgoing.length > 0 && <details open={showEmpty}><summary>Đã gửi {friendships.outgoing.length} lời mời</summary>{friendships.outgoing.map(p => <div className="community-friend-request" key={p._id}><Avatar person={p} /><div className="min-w-0"><b>{p.name}</b><FriendshipActions person={p} /></div></div>)}</details>}
  </section>;
}

export function FriendRequestNotice() {
  const { friendships } = useCommunity();
  if (!friendships.incoming.length) return null;
  return <Link to="/community?tab=friends" className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 text-amber-950 p-4 mb-5" role="status"><span className="text-2xl">💛</span><span className="flex-1"><b className="text-sm">Bạn có {friendships.incoming.length} lời mời kết bạn mới</b><small className="block mt-1">{friendships.incoming.slice(0, 2).map(p => p.name).join(', ')} đang muốn kết nối với bạn.</small></span><span className="text-sm font-semibold">Xem →</span></Link>;
}
