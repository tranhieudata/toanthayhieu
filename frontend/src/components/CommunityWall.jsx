import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from './CommunityWidgets';
import { FriendshipActions } from './CommunityFriends';
import { useAuth } from '../context/AuthContext';
import { useCommunity } from '../context/CommunityContext';
import api from '../api/axios';

export default function CommunityWall({ author }) {
  const { user } = useAuth();
  const { revision } = useCommunity();
  const [state, setState] = useState(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api.get(`/community/people/${author}/wall`, { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setState({ author, data });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ author, error: error.response?.data?.message || 'Chưa tải được tường cá nhân.' });
    });
    return () => controller.abort();
  }, [author, revision, retry]);
  const current = state?.author === author ? state : null;
  if (!current) return <section className="community-panel" role="status">Đang ghé thăm tường nhà…</section>;
  if (current.error) return <section className="community-panel" role="alert">{current.error} <button className="underline" onClick={() => setRetry(n => n + 1)}>Thử lại</button></section>;
  const { person, garden, awards, postCount } = current.data;
  const isMe = user._id === person._id;
  const points = garden.studyPoints + garden.communityPoints;
  return <section className="community-wall community-panel">
    <div className="community-wall-heading">
      <Avatar person={person} frame={garden.equippedFrame} />
      <div className="min-w-0 flex-1"><p className="text-xs text-gray-500">{isMe ? 'TƯỜNG CỦA TÔI' : 'THĂM TƯỜNG NHÀ BẠN'}</p><h2 className="text-xl font-bold break-words">{person.name}</h2><p className="text-sm text-gray-500">{person.role === 'admin' ? 'Quản trị viên' : 'Học sinh'} · {postCount} bài đăng</p></div>
      {!isMe && <FriendshipActions person={person} />}
    </div>
    <div className="community-wall-garden">
      <div className="community-wall-tree"><span role="img" aria-label={garden.growth >= 20 ? 'Cây trưởng thành' : garden.growth >= 7 ? 'Cây đang lớn' : 'Mầm cây'}>{garden.growth >= 20 ? '🌳' : garden.growth >= 7 ? '🌿' : '🌱'}</span><p>{garden.growth} ngày chăm cây</p></div>
      <div><h3 className="font-bold text-lg">Khu vườn của {isMe ? 'tôi' : person.name}</h3><p className="text-sm text-gray-500 mt-2">{garden.lastWatered ? `Chăm cây gần nhất: ${new Date(garden.lastWatered).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` : 'Một khu vườn mới, chờ những thành tích đầu tiên.'}</p>{garden.needsWater && garden.growth > 0 && <p className="text-sm text-gray-500 mt-1">Cây đang cần một chút nước.</p>}
        {isMe && <Link to="/community?tab=garden" className="inline-block text-sm text-blue-600 mt-3">Chăm sóc khu vườn →</Link>}
      </div>
    </div>
    <dl className="community-wall-stats">{[[points, 'Tổng điểm'], [garden.studyPoints, 'Điểm học tập'], [garden.communityPoints, 'Điểm cộng đồng']].map(([value, label]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <h3 className="font-bold mt-5 mb-3">🏆 Thành tích trong vườn</h3>
    <div className="community-wall-achievements">
      {garden.growth > 0 && <span>🌱 {garden.growth} ngày chăm cây</span>}
      {garden.rewards.map(reward => <span key={reward.id}>🎁 {reward.label}</span>)}
      {awards.map(award => <span key={award.month}>🏅 Tháng {award.month}: {award.gift}</span>)}
      {!garden.growth && !garden.rewards.length && !awards.length && <p className="text-sm text-gray-500">Chưa có thành tích. Mỗi bài học hôm nay sẽ giúp khu vườn lớn thêm.</p>}
    </div>
  </section>;
}
