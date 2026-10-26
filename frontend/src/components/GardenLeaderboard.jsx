import { useEffect, useState } from 'react';
import { FiAward } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCommunity } from '../context/CommunityContext';
import { Avatar } from './CommunityWidgets';
import api from '../api/axios';

export default function GardenLeaderboard({ points }) {
  const { user } = useAuth(), { revision } = useCommunity();
  const [data, setData] = useState(null), [classId, setClassId] = useState(''), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    api.get('/community/garden/leaderboard', { params: classId ? { class: classId } : {} }).then(({ data: result }) => { if (active) { setData(result); setError(''); } }).catch(e => { if (active) setError(e.response?.data?.message || 'Chưa tải được bảng xếp hạng'); });
    return () => { active = false; };
  }, [classId, revision, points, retry]);
  return <section className="community-panel garden-leaderboard"><div className="garden-leaderboard-heading"><span className="locket-icon-tile"><FiAward /></span><div><h2>Top 10 cùng lớp</h2><p>Cùng chăm cây, cùng tiến bộ.</p></div></div>
    {error ? <p role="alert" className="text-sm text-red-500">{error}<button className="ml-2 underline" onClick={() => setRetry(n => n + 1)}>Thử lại</button></p> : !data ? <p className="garden-review-note">Đang tải bảng xếp hạng…</p> : <>
      {data.classes.length > 0 ? <><label className="sr-only" htmlFor="garden-ranking-class">Lớp xếp hạng</label><select id="garden-ranking-class" className="community-input mb-4" value={classId || data.classId} onChange={e => { setClassId(e.target.value); setData(null); }}>{data.classes.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}</select>
        <ol className="garden-ranking">{data.rows.map((person, index) => <li key={person._id} className={person._id === user._id ? 'is-me' : ''}><span className={`garden-rank ${index < 3 ? 'is-podium' : ''}`}>{index + 1}</span><Link to={`/community?author=${person._id}`} aria-label={`Thăm tường ${person.name}`}><Avatar person={person} /></Link><span className="garden-rank-name"><Link to={`/community?author=${person._id}`}><b>{person.name}{person._id === user._id ? ' (bạn)' : ''}</b></Link><small>{person.studyPoints} học tập · {person.communityPoints} cộng đồng</small></span><strong>{person.points}<small>điểm</small></strong></li>)}</ol>
        {!data.rows.length && <p className="garden-review-note">Chưa có học sinh đang hoạt động trong lớp này.</p>}
      </> : <p className="garden-review-note">Tham gia một lớp học để cùng bạn bè xuất hiện trên bảng xếp hạng.</p>}
      <p className="garden-review-note mt-4">Xếp theo tổng điểm học tập + cộng đồng đã tích lũy. Đổi quà không làm giảm thứ hạng. Khi bằng điểm, ưu tiên điểm học tập.</p>
    </>}
  </section>;
}
