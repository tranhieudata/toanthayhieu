import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiTrash2, FiX, FiUsers } from 'react-icons/fi';

const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

const emptyForm = {
  name: '', description: '', courses: [], schedules: [],
  startDate: '', endDate: '', maxStudents: 30, isActive: true
};

export default function AdminClasses() {
  const [classes, setClasses] = useState([]);
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [addSchedule, setAddSchedule] = useState({ dayOfWeek: 1, startTime: '', endTime: '', room: '' });

  const load = () => api.get('/classes').then(res => setClasses(res.data));

  useEffect(() => {
    load();
    api.get('/courses/admin/all').then(res => setCourses(res.data));
    api.get('/users?role=student&limit=100').then(res => setStudents(res.data.users));
  }, []);

  const openCreate = () => { setForm(emptyForm); setEditId(null); setModal(true); };
  const openEdit = (c) => {
    setForm({
      name: c.name, description: c.description,
      courses: c.courses.map(x => x._id || x),
      schedules: c.schedules || [],
      startDate: c.startDate ? c.startDate.substring(0, 10) : '',
      endDate: c.endDate ? c.endDate.substring(0, 10) : '',
      maxStudents: c.maxStudents, isActive: c.isActive
    });
    setEditId(c._id); setModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      if (editId) { await api.put(`/classes/${editId}`, form); toast.success('Cập nhật lớp học thành công'); }
      else { await api.post('/classes', form); toast.success('Tạo lớp học thành công'); }
      setModal(false); load();
    } catch (err) { toast.error(err.response?.data?.message || 'Có lỗi xảy ra'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa lớp học này?')) return;
    try { await api.delete(`/classes/${id}`); toast.success('Xóa thành công'); load(); }
    catch { toast.error('Xóa thất bại'); }
  };

  const toggleCourse = (id) => {
    setForm(f => ({ ...f, courses: f.courses.includes(id) ? f.courses.filter(c => c !== id) : [...f.courses, id] }));
  };

  const addSch = () => {
    if (!addSchedule.startTime || !addSchedule.endTime) return toast.error('Vui lòng nhập thời gian');
    setForm(f => ({ ...f, schedules: [...f.schedules, { ...addSchedule }] }));
    setAddSchedule({ dayOfWeek: 1, startTime: '', endTime: '', room: '' });
  };

  const removeSch = (i) => setForm(f => ({ ...f, schedules: f.schedules.filter((_, idx) => idx !== i) }));

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quản lý lớp học</h1>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2"><FiPlus /> Thêm lớp học</button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {classes.map(cls => (
          <div key={cls._id} className="card p-5">
            <div className="flex justify-between items-start mb-3">
              <h3 className="font-semibold text-gray-900">{cls.name}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {cls.isActive ? 'Đang hoạt động' : 'Đã kết thúc'}
              </span>
            </div>
            <p className="text-sm text-gray-500 mb-3">{cls.description}</p>
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
              <FiUsers /> <span>{cls.students?.length || 0}/{cls.maxStudents} học sinh</span>
            </div>
            {cls.schedules?.length > 0 && (
              <div className="text-xs text-gray-500 mb-3">
                {cls.schedules.map((s, i) => (
                  <div key={i}>{days[s.dayOfWeek]}: {s.startTime} - {s.endTime} {s.room && `(${s.room})`}</div>
                ))}
              </div>
            )}
            <div className="text-xs text-gray-400 mb-3">
              {cls.courses?.length || 0} khóa học
            </div>
            <div className="flex gap-2">
              <button onClick={() => openEdit(cls)} className="btn-secondary flex-1 text-sm flex items-center justify-center gap-1"><FiEdit2 /> Sửa</button>
              <button onClick={() => handleDelete(cls._id)} className="btn-danger text-sm px-3"><FiTrash2 /></button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white">
              <h2 className="font-bold text-lg">{editId ? 'Chỉnh sửa' : 'Tạo'} lớp học</h2>
              <button onClick={() => setModal(false)}><FiX /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên lớp *</label>
                <input className="input-field" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                <textarea className="input-field" rows={2} value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngày bắt đầu</label>
                  <input type="date" className="input-field" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngày kết thúc</label>
                  <input type="date" className="input-field" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số học sinh tối đa</label>
                <input type="number" className="input-field" value={form.maxStudents} onChange={e => setForm({...form, maxStudents: Number(e.target.value)})} min={1} />
              </div>

              {/* Courses */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Khóa học trong lớp</label>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                  {courses.map(c => (
                    <label key={c._id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-sm ${form.courses.includes(c._id) ? 'bg-blue-50 border-blue-300' : 'border-gray-200'}`}>
                      <input type="checkbox" checked={form.courses.includes(c._id)} onChange={() => toggleCourse(c._id)} />
                      <span className="truncate">{c.title}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Schedules */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Lịch học</label>
                {form.schedules.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-blue-50 rounded-lg px-3 py-2 mb-2">
                    <span className="flex-1">{days[s.dayOfWeek]}: {s.startTime} - {s.endTime} {s.room && `(${s.room})`}</span>
                    <button type="button" onClick={() => removeSch(i)} className="text-red-500"><FiX /></button>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <select className="input-field text-sm" value={addSchedule.dayOfWeek} onChange={e => setAddSchedule({...addSchedule, dayOfWeek: Number(e.target.value)})}>
                    {days.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                  <input className="input-field text-sm" type="time" value={addSchedule.startTime} onChange={e => setAddSchedule({...addSchedule, startTime: e.target.value})} placeholder="Giờ bắt đầu" />
                  <input className="input-field text-sm" type="time" value={addSchedule.endTime} onChange={e => setAddSchedule({...addSchedule, endTime: e.target.value})} placeholder="Giờ kết thúc" />
                  <input className="input-field text-sm" value={addSchedule.room} onChange={e => setAddSchedule({...addSchedule, room: e.target.value})} placeholder="Phòng học" />
                </div>
                <button type="button" onClick={addSch} className="btn-secondary text-sm mt-2 w-full">+ Thêm lịch</button>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm({...form, isActive: e.target.checked})} className="w-4 h-4" />
                <span className="text-sm font-medium text-gray-700">Đang hoạt động</span>
              </label>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(false)} className="btn-secondary flex-1">Hủy</button>
                <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Đang lưu...' : 'Lưu'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
