import { useEffect, useState } from 'react';
import { FiAward, FiBookOpen, FiStar, FiUsers } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCommunity } from '../context/CommunityContext';
import { Avatar } from './CommunityWidgets';
import { StudentAvatar } from './GardenArtwork';
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
        <div className="garden-ranking-legend"><span>HỌC SINH</span><span>TỔNG ĐIỂM</span></div>
        <ol className="garden-ranking">{data.rows.map((person, index) => {
          const target = Math.max(100, ...data.rows.map(row => row.points));
          const badge = person.studyPoints >= 100 ? { Icon: FiBookOpen, title: 'Chăm học', note: 'Tích lũy ít nhất 100 điểm học tập' } : person.communityPoints >= 50 ? { Icon: FiUsers, title: 'Bạn đồng hành', note: 'Tích lũy ít nhất 50 điểm cộng đồng' } : person.points > 0 ? { Icon: FiStar, title: 'Mầm tri thức', note: 'Đã nhận những điểm đầu tiên' } : null;
          return <li key={person._id} className={person._id === user._id ? 'is-me' : ''}><span className={`garden-rank ${index < 3 ? `is-podium podium-${index + 1}` : ''}`}>{index + 1}</span><Link className="garden-avatar-link" to={`/community?author=${person._id}`} aria-label={`Thăm tường ${person.name}`}>{person.avatar ? <Avatar person={person} /> : <StudentAvatar seed={person._id || person.name} />}</Link><div className="garden-rank-name"><Link to={`/community?author=${person._id}`}><b>{person.name}{person._id === user._id ? ' (bạn)' : ''}</b></Link><small>{person.studyPoints} học tập · {person.communityPoints} cộng đồng</small><div className="garden-score-bars"><progress className="study-progress" max={target} value={person.studyPoints} aria-label={`${person.name}: ${person.studyPoints} điểm học tập, mốc so sánh ${target}`} /><progress className="community-progress" max={target} value={person.communityPoints} aria-label={`${person.name}: ${person.communityPoints} điểm cộng đồng, mốc so sánh ${target}`} /></div>{badge && <span className="garden-achievement" title={badge.note}><badge.Icon />{badge.title}</span>}</div><strong>{person.points}<small>điểm</small></strong></li>;
        })}</ol>
        {!data.rows.length && <p className="garden-review-note">Chưa có học sinh đang hoạt động trong lớp này.</p>}
      </> : <p className="garden-review-note">Tham gia một lớp học để cùng bạn bè xuất hiện trên bảng xếp hạng.</p>}
      <p className="garden-review-note mt-4">Xếp theo tổng điểm học tập + cộng đồng đã tích lũy. Đổi quà không làm giảm thứ hạng. Khi bằng điểm, ưu tiên điểm học tập.</p>
    </>}
  </section>;
}
