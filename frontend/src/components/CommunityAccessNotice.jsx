import { Link } from 'react-router-dom';
import { useCommunity } from '../context/CommunityContext';

export default function CommunityAccessNotice({ compact = false }) {
  const { access, refreshAccess } = useCommunity();
  return <section className="rounded-3xl border border-[#454333] bg-[#23231e] p-6 text-[#f6f5ee]" aria-live="polite">
    <h1 className="text-xl font-bold text-[#ffda45]">{!access ? 'Đang kiểm tra bài tập…' : access.error ? 'Chưa kiểm tra được bài tập' : 'Học xong rồi cùng chia sẻ nhé!'}</h1>
    {access && !access.error && <p className="mt-3">{access.homeworkAccessMode === 'graded' ? <>Bạn còn <b>{access.remaining} bài tập</b> chưa được chấm. Hãy nộp đủ bài và chờ giáo viên chấm để mở mạng xã hội và trò chuyện với bạn bè.</> : <>Bạn còn <b>{access.remaining} bài tập</b> chưa hoàn thành. Nộp đủ các bài để mở mạng xã hội và trò chuyện với bạn bè.</>}</p>}
    {access?.error && <p className="mt-3">Vui lòng thử lại để kiểm tra quyền truy cập mạng xã hội.</p>}
    {!compact && access?.homeworks?.length > 0 && <ul className="mt-5 space-y-2">
      {access.homeworks.map(homework => <li key={homework._id}><Link className="block rounded-xl bg-white/5 p-3 hover:bg-white/10" to={`/homeworks?homework=${homework._id}`}>
        <strong>{homework.title}</strong><span className="block text-sm text-[#b9b9a9]">{homework.class?.name}{homework.dueDate ? ` · Hạn nộp: ${new Date(homework.dueDate).toLocaleDateString('vi-VN')}` : ''} · Làm bài →</span>
      </Link></li>)}
    </ul>}
    {access && <div className="mt-5 flex flex-wrap gap-4 items-center"><Link to="/homeworks" className="rounded-xl bg-[#ffda45] px-4 py-2 font-semibold text-[#222]">Đến bài tập</Link><button onClick={refreshAccess} className="text-sm underline">Kiểm tra lại</button></div>}
  </section>;
}
