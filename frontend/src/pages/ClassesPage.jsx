import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import { useTheme } from '../context/ThemeContext';
import { StudyPageHeading, StudyEmptyState } from '../components/StudyPageHeading';
import { FiUsers, FiCalendar, FiBookOpen, FiSend, FiArrowRight } from 'react-icons/fi';

const STATUS_LABEL = { pending: 'Chờ duyệt', approved: 'Đã vào lớp', rejected: 'Bị từ chối' };
const STATUS_COLOR = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
};

const DAYS_VN = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

function formatSchedules(schedules) {
  if (!schedules || schedules.length === 0) return 'Chưa có lịch học';
  return schedules
    .map(s => `${DAYS_VN[s.dayOfWeek]}: ${s.startTime}–${s.endTime}${s.room ? ` (${s.room})` : ''}`)
    .join(', ');
}

export default function ClassesPage() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(null);
  const [message, setMessage] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/classes');
      setClasses(res.data);
    } catch {
      toast.error('Không tải được danh sách lớp học');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openApply = (cls) => { setSelectedClass(cls); setMessage(''); setShowModal(true); };

  const handleApply = async (e) => {
    e.preventDefault();
    if (!selectedClass) return;
    setApplying(selectedClass._id);
    try {
      await api.post('/class-enrollments', { classId: selectedClass._id, message });
      toast.success('Đã gửi đơn đăng ký, chờ admin xét duyệt!');
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gửi đơn thất bại');
    } finally { setApplying(null); }
  };

  return (
    <div className="study-page study-ClassesPage" data-theme={theme}>
      <Navbar />
      <div className="study-content">
        <StudyPageHeading icon={FiUsers} eyebrow="CÙNG MỘT LỚP. CÙNG TIẾN BỘ." title="Lớp học của chúng mình." description="Tìm lớp phù hợp, gặp thầy cô và cùng bạn bè học thêm những điều mới." stats={[
          { label: 'Lớp học', value: loading ? '—' : classes.length },
          { label: 'Đã tham gia', value: loading ? '—' : classes.filter(cls => cls.myEnrollmentStatus === 'approved').length },
          { label: 'Chờ duyệt', value: loading ? '—' : classes.filter(cls => cls.myEnrollmentStatus === 'pending').length },
        ]} />

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : classes.length === 0 ? (
          <StudyEmptyState icon={FiUsers} title="Lớp học mới đang chờ bạn." description="Hiện chưa có lớp học nào. Hãy quay lại khi thầy cô mở lớp nhé." />
        ) : (
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {classes.map(cls => (
              <div key={cls._id} className="study-card study-class-card">
                <span className="study-class-mark" aria-hidden="true"><FiBookOpen /></span>
                <div className="flex justify-between items-start mb-3">
                  <h2 className="text-lg font-bold text-gray-900">{cls.name}</h2>
                  {cls.myEnrollmentStatus && (
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLOR[cls.myEnrollmentStatus]}`}>
                      {STATUS_LABEL[cls.myEnrollmentStatus]}
                    </span>
                   
                  )}
                </div>
                {cls.description && <p className="text-sm text-gray-500 mb-3 line-clamp-2">{cls.description}</p>}
                
                <div className="flex flex-wrap gap-3 text-sm text-gray-600 mb-4">
                  {/* <span className="flex items-center gap-1"><FiUsers size={14} /> {cls.studentCount || 0} học sinh</span> */}
                  <span className="flex items-center gap-1"><FiBookOpen size={14} /> {cls.courses?.length || 0} khóa học</span>
                  {cls.maxStudents && <span className="flex items-center gap-1"><FiCalendar size={14} /> Tối đa {cls.maxStudents}</span>}
                </div>

                {/* Schedule */}
                {cls.schedules && cls.schedules.length > 0 && (
                  <div className="study-class-schedule mb-4 text-sm">
                    <p className="font-medium text-gray-700 flex items-center gap-1 mb-1.5">
                      <FiCalendar size={14} /> Lịch học
                    </p>
                    <div className="space-y-1 text-gray-600">
                      {cls.schedules.map((s, i) => (
                        <div key={i} className="text-xs pl-5">
                          {DAYS_VN[s.dayOfWeek]}: {s.startTime}–{s.endTime}
                          {s.room && <span className="text-gray-400 ml-1">(Phòng {s.room})</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Courses in class */}
                {cls.courses?.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-gray-400 uppercase mb-1">Khóa học trong lớp</p>
                    <div className="flex flex-wrap gap-1">
                      {cls.courses.map(c => (
                        <span key={c._id} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{c.title}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="study-class-actions">
                {/* Liên hệ và đăng ký lớp */}
                {cls.myEnrollmentStatus !== 'approved' && (

                  <a href="https://zalo.me/0382468988" target="_blank" rel="noopener noreferrer" className="btn-secondary w-full mb-3 flex items-center justify-center gap-2">
                    <FiSend size={14} /> Liên hệ qua Zalo để duyệt vào lớp
                  </a>
                  )}
                {/* Action button */}
                {!cls.myEnrollmentStatus ? (
                  <button
                    onClick={() => openApply(cls)}
                    disabled={applying === cls._id}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    <FiSend size={14} /> Đăng ký lớp
                  </button>
                ) : cls.myEnrollmentStatus === 'rejected' ? (
                  <button
                    onClick={() => openApply(cls)}
                    disabled={applying === cls._id}
                    className="btn-secondary w-full flex items-center justify-center gap-2"
                  >
                    <FiSend size={14} /> Đăng ký lại
                  </button>
                ) : cls.myEnrollmentStatus === 'approved' ? (
                  <button
                    onClick={() => navigate(`/class/${cls._id}`)}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    <FiArrowRight size={14} /> Xem lớp học
                  </button>
                ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Apply modal */}
      {showModal && selectedClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="study-dialog w-full max-w-md">
            <div className="p-6 border-b">
              <h2 className="text-lg font-bold">Đăng ký lớp: {selectedClass.name}</h2>
            </div>
            <form onSubmit={handleApply} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lý do / Giới thiệu bản thân (không bắt buộc)</label>
                <textarea
                  className="input-field resize-none"
                  rows={4}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Ví dụ: Em đang học lớp 10, muốn ôn luyện toán..."
                />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Hủy</button>
                <button type="submit" disabled={applying === selectedClass._id} className="btn-primary flex-1">
                  {applying === selectedClass._id ? 'Đang gửi...' : 'Gửi đơn'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
