import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiTrash2, FiX, FiUsers, FiArrowLeft, FiToggleLeft, FiToggleRight, FiBook, FiChevronDown, FiChevronRight, FiSearch, FiUserPlus } from 'react-icons/fi';

const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

const emptyForm = {
  name: '', description: '', courses: [], schedules: [],
  startDate: '', endDate: '', maxStudents: 30, isActive: true, feePerSession: 0
};

export default function AdminClasses() {
  const [classes, setClasses] = useState([]);
  const [courses, setCourses] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [addSchedule, setAddSchedule] = useState({ dayOfWeek: 1, startTime: '', endTime: '', room: '' });

  // Detail view
  const [selectedClass, setSelectedClass] = useState(null);
  const [activeTab, setActiveTab] = useState('lessons');
  const [classDetail, setClassDetail] = useState(null);
  const [classVisibility, setClassVisibility] = useState({}); // lessonId -> bool
  const [classLessonsMap, setClassLessonsMap] = useState({}); // courseId -> lessons[]
  const [classEnrollments, setClassEnrollments] = useState([]);
  const [expandedCourses, setExpandedCourses] = useState({});
  const [detailLoading, setDetailLoading] = useState(false);

  // Add student to class modal
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const load = () => api.get('/classes').then(res => setClasses(res.data));

  useEffect(() => {
    load();
    api.get('/courses/admin/all').then(res => setCourses(res.data));
  }, []);

  const openCreate = () => { setForm(emptyForm); setEditId(null); setModal(true); };
  const openEdit = (c) => {
    setForm({
      name: c.name, description: c.description,
      courses: c.courses.map(x => x._id || x),
      schedules: c.schedules || [],
      startDate: c.startDate ? c.startDate.substring(0, 10) : '',
      endDate: c.endDate ? c.endDate.substring(0, 10) : '',
      maxStudents: c.maxStudents, isActive: c.isActive,
      feePerSession: c.feePerSession || 0
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

  // --- Detail view ---
  const openClassDetail = async (cls) => {
    setSelectedClass(cls);
    setActiveTab('lessons');
    setDetailLoading(true);
    setClassVisibility({});
    setClassLessonsMap({});
    setClassEnrollments([]);
    setExpandedCourses({});
    try {
      const [detailRes, enrollRes] = await Promise.all([
        api.get(`/classes/${cls._id}`),
        api.get(`/class-enrollments?classId=${cls._id}&status=approved`),
      ]);
      const detail = detailRes.data;
      setClassDetail(detail);

      const visMap = {};
      (detail.lessonVisibility || []).forEach(lv => {
        visMap[(lv.lesson?._id || lv.lesson).toString()] = lv.isVisible;
      });
      setClassVisibility(visMap);
      setClassEnrollments(enrollRes.data.enrollments || []);

      const lessonsMap = {};
      const expanded = {};
      await Promise.all((detail.courses || []).map(async (c) => {
        const courseId = (c._id || c).toString();
        const res = await api.get(`/lessons?course=${courseId}`);
        lessonsMap[courseId] = res.data;
        expanded[courseId] = true;
      }));
      setClassLessonsMap(lessonsMap);
      setExpandedCourses(expanded);
    } catch {
      toast.error('Không thể tải dữ liệu lớp học');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleToggleClassLesson = async (lessonId) => {
    try {
      const res = await api.patch(`/classes/${selectedClass._id}/lessons/${lessonId}/toggle`);
      setClassVisibility(prev => ({ ...prev, [lessonId]: res.data.isVisible }));
      toast.success(res.data.isVisible ? 'Đã bật bài học cho lớp' : 'Đã tắt bài học cho lớp');
    } catch {
      toast.error('Không thể thay đổi trạng thái');
    }
  };

  const toggleExpandCourse = (courseId) => {
    setExpandedCourses(prev => ({ ...prev, [courseId]: !prev[courseId] }));
  };

  const handleStudentSearch = async (q) => {
    setStudentSearch(q);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const { data } = await api.get(`/users?role=student&search=${encodeURIComponent(q)}&limit=10`);
      setSearchResults(data.users || []);
    } catch { setSearchResults([]); }
    finally { setSearchLoading(false); }
  };

  const handleAdminAddStudent = async (studentId) => {
    try {
      await api.post('/class-enrollments/admin-add', { classId: selectedClass._id, studentId });
      toast.success('Đã thêm học sinh vào lớp');
      const { data } = await api.get(`/class-enrollments?classId=${selectedClass._id}&status=approved`);
      setClassEnrollments(data.enrollments || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi thêm học sinh');
    }
  };

  const handleAdminRemoveStudent = async (studentId, studentName) => {
    if (!confirm(`Xóa ${studentName} khỏi lớp?`)) return;
    try {
      await api.post('/class-enrollments/admin-remove', { classId: selectedClass._id, studentId });
      toast.success('Đã xóa học sinh khỏi lớp');
      const { data } = await api.get(`/class-enrollments?classId=${selectedClass._id}&status=approved`);
      setClassEnrollments(data.enrollments || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi xóa học sinh');
    }
  };

  // --- Detail view UI ---
  if (selectedClass) {
    return (
      <div>
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => setSelectedClass(null)}
            className="btn-secondary flex items-center gap-2"
          >
            <FiArrowLeft /> Quay lại
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{selectedClass.name}</h1>
            <p className="text-sm text-gray-500">{selectedClass.description}</p>
          </div>
          <div className="ml-auto flex gap-2">
            <button onClick={() => { openEdit(selectedClass); }} className="btn-secondary flex items-center gap-1 text-sm">
              <FiEdit2 /> Sửa lớp
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b">
          {[['lessons', 'Bài học theo lớp'], ['students', 'Học sinh']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {detailLoading ? (
          <div className="text-center py-12 text-gray-500">Đang tải...</div>
        ) : (
          <>
            {/* Lessons tab */}
            {activeTab === 'lessons' && (
              <div className="space-y-4">
                {(classDetail?.courses || []).length === 0 ? (
                  <div className="card p-8 text-center text-gray-500">
                    <FiBook size={40} className="mx-auto mb-3 text-gray-300" />
                    <p>Lớp này chưa có khóa học nào</p>
                  </div>
                ) : (classDetail?.courses || []).map(c => {
                  const courseId = (c._id || c).toString();
                  const courseTitle = c.title || courses.find(x => x._id === courseId)?.title || courseId;
                  const lessons = classLessonsMap[courseId] || [];
                  const isExpanded = expandedCourses[courseId];
                  return (
                    <div key={courseId} className="card overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                        onClick={() => toggleExpandCourse(courseId)}
                      >
                        <div className="flex items-center gap-3">
                          <FiBook className="text-blue-500" />
                          <span className="font-semibold text-gray-900">{courseTitle}</span>
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                            {lessons.filter(l => classVisibility[l._id]).length}/{lessons.length} bài đang bật
                          </span>
                        </div>
                        {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                      </button>
                      {isExpanded && (
                        <div className="border-t divide-y">
                          {lessons.length === 0 ? (
                            <p className="px-4 py-3 text-sm text-gray-500">Khóa học này chưa có bài học nào</p>
                          ) : lessons.map((lesson, idx) => {
                            const visible = !!classVisibility[lesson._id];
                            return (
                              <div key={lesson._id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                                <span className="text-sm text-gray-400 w-6">{idx + 1}</span>
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-gray-900">{lesson.title}</p>
                                  <p className="text-xs text-gray-400">
                                    {lesson.duration ? `${lesson.duration} phút` : ''}
                                    {!lesson.isPublished ? ' · (chưa đăng toàn cục)' : ''}
                                  </p>
                                </div>
                                <button
                                  onClick={() => handleToggleClassLesson(lesson._id)}
                                  title={visible ? 'Đang bật – Nhấn để tắt cho lớp này' : 'Đang tắt – Nhấn để bật cho lớp này'}
                                  className={`text-2xl transition-colors ${visible ? 'text-green-500 hover:text-green-700' : 'text-gray-300 hover:text-gray-500'}`}
                                >
                                  {visible ? <FiToggleRight /> : <FiToggleLeft />}
                                </button>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${visible ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                  {visible ? 'Bật' : 'Tắt'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Students tab */}
            {activeTab === 'students' && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button
                    onClick={() => { setStudentSearch(''); setSearchResults([]); setShowAddStudent(true); }}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  ><FiUserPlus /> Thêm học sinh</button>
                </div>
                <div className="card overflow-hidden">
                  {classEnrollments.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      <FiUsers size={40} className="mx-auto mb-3 text-gray-300" />
                      <p>Chưa có học sinh nào trong lớp</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          {['#', 'Học sinh', 'Email', 'Ngày tham gia', ''].map(h => (
                            <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {classEnrollments.map((en, idx) => (
                          <tr key={en._id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {en.student?.avatar ? (
                                  <img src={en.student.avatar} className="w-7 h-7 rounded-full object-cover" alt="" />
                                ) : (
                                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">
                                    {en.student?.name?.[0]?.toUpperCase() || '?'}
                                  </div>
                                )}
                                <span className="font-medium text-gray-900">{en.student?.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-500">{en.student?.email}</td>
                            <td className="px-4 py-3 text-gray-400">{new Date(en.createdAt).toLocaleDateString('vi-VN')}</td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => handleAdminRemoveStudent(en.student?._id, en.student?.name)}
                                className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded px-2 py-1"
                              ><FiTrash2 /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Edit modal */}
        {modal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white">
                <h2 className="font-bold text-lg">Chỉnh sửa lớp học</h2>
                <button onClick={() => setModal(false)}><FiX /></button>
              </div>
              <form onSubmit={async (e) => { await handleSubmit(e); setSelectedClass(prev => ({ ...prev, ...form, feePerSession: form.feePerSession })); }} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tên lớp *</label>
                  <input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                  <textarea className="input-field" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ngày bắt đầu</label>
                    <input type="date" className="input-field" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ngày kết thúc</label>
                    <input type="date" className="input-field" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Số học sinh tối đa</label>
                    <input type="number" className="input-field" value={form.maxStudents} onChange={e => setForm({ ...form, maxStudents: Number(e.target.value) })} min={1} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Học phí / buổi (VNĐ)</label>
                    <input type="number" className="input-field" value={form.feePerSession} onChange={e => setForm({ ...form, feePerSession: Number(e.target.value) })} min={0} />
                  </div>
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
                    <select className="input-field text-sm" value={addSchedule.dayOfWeek} onChange={e => setAddSchedule({ ...addSchedule, dayOfWeek: Number(e.target.value) })}>
                      {days.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                    <input className="input-field text-sm" type="time" value={addSchedule.startTime} onChange={e => setAddSchedule({ ...addSchedule, startTime: e.target.value })} placeholder="Giờ bắt đầu" />
                    <input className="input-field text-sm" type="time" value={addSchedule.endTime} onChange={e => setAddSchedule({ ...addSchedule, endTime: e.target.value })} placeholder="Giờ kết thúc" />
                    <input className="input-field text-sm" value={addSchedule.room} onChange={e => setAddSchedule({ ...addSchedule, room: e.target.value })} placeholder="Phòng học" />
                  </div>
                  <button type="button" onClick={addSch} className="btn-secondary text-sm mt-2 w-full">+ Thêm lịch</button>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4" />
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

        {/* Add Student Modal */}
        {showAddStudent && (() => {
          const enrolledIds = new Set(classEnrollments.map(en => en.student?._id || en.student));
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowAddStudent(false)}>
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b">
                  <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                    <FiUserPlus /> Thêm học sinh — {selectedClass.name}
                  </h2>
                  <button onClick={() => setShowAddStudent(false)} className="text-gray-400 hover:text-gray-700"><FiX /></button>
                </div>
                <div className="p-4 space-y-3">
                  <div className="relative">
                    <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      autoFocus
                      type="text"
                      className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Tìm theo tên hoặc email..."
                      value={studentSearch}
                      onChange={e => handleStudentSearch(e.target.value)}
                    />
                  </div>

                  <div className="max-h-72 overflow-y-auto divide-y rounded-lg border border-gray-100">
                    {searchLoading && (
                      <p className="text-center text-sm text-gray-400 py-6">Đang tìm...</p>
                    )}
                    {!searchLoading && studentSearch && searchResults.length === 0 && (
                      <p className="text-center text-sm text-gray-400 py-6">Không tìm thấy học sinh</p>
                    )}
                    {!searchLoading && !studentSearch && (
                      <p className="text-center text-sm text-gray-400 py-6">Nhập tên hoặc email để tìm học sinh</p>
                    )}
                    {searchResults.map(u => {
                      const alreadyIn = enrolledIds.has(u._id);
                      return (
                        <div key={u._id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                          {u.avatar ? (
                            <img src={u.avatar} className="w-8 h-8 rounded-full object-cover" alt="" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-sm font-bold">
                              {u.name?.[0]?.toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                            <p className="text-xs text-gray-400 truncate">{u.email}</p>
                          </div>
                          {alreadyIn ? (
                            <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full font-medium whitespace-nowrap">Đã trong lớp</span>
                          ) : (
                            <button
                              onClick={() => handleAdminAddStudent(u._id)}
                              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium whitespace-nowrap"
                            >+ Thêm</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  // --- List view ---
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quản lý lớp học</h1>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2"><FiPlus /> Thêm lớp học</button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {classes.map(cls => (
          <div
            key={cls._id}
            className="card p-5 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => openClassDetail(cls)}
          >
            <div className="flex justify-between items-start mb-3">
              <h3 className="font-semibold text-gray-900">{cls.name}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {cls.isActive ? 'Đang hoạt động' : 'Đã kết thúc'}
              </span>
            </div>
            <p className="text-sm text-gray-500 mb-3">{cls.description}</p>
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
              
              <FiUsers /> <span>{cls.studentCount || 0}/{cls.maxStudents} học sinh</span>
            </div>
            {cls.schedules?.length > 0 && (
              <div className="text-xs text-gray-500 mb-3">
                {cls.schedules.map((s, i) => (
                  <div key={i}>{days[s.dayOfWeek]}: {s.startTime} - {s.endTime} {s.room && `(${s.room})`}</div>
                ))}
              </div>
            )}
            <div className="text-xs text-gray-400 mb-3">{cls.courses?.length || 0} khóa học</div>
            <div className="flex gap-2" onClick={e => e.stopPropagation()}>
              <button onClick={() => openEdit(cls)} className="btn-secondary flex-1 text-sm flex items-center justify-center gap-1">
                <FiEdit2 /> Sửa
              </button>
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
                <input className="input-field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                <textarea className="input-field" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngày bắt đầu</label>
                  <input type="date" className="input-field" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngày kết thúc</label>
                  <input type="date" className="input-field" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số học sinh tối đa</label>
                <input type="number" className="input-field" value={form.maxStudents} onChange={e => setForm({ ...form, maxStudents: Number(e.target.value) })} min={1} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Học phí / buổi (VNĐ)</label>
                <input type="number" className="input-field" value={form.feePerSession} onChange={e => setForm({ ...form, feePerSession: Number(e.target.value) })} min={0} />
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
                  <select className="input-field text-sm" value={addSchedule.dayOfWeek} onChange={e => setAddSchedule({ ...addSchedule, dayOfWeek: Number(e.target.value) })}>
                    {days.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                  <input className="input-field text-sm" type="time" value={addSchedule.startTime} onChange={e => setAddSchedule({ ...addSchedule, startTime: e.target.value })} placeholder="Giờ bắt đầu" />
                  <input className="input-field text-sm" type="time" value={addSchedule.endTime} onChange={e => setAddSchedule({ ...addSchedule, endTime: e.target.value })} placeholder="Giờ kết thúc" />
                  <input className="input-field text-sm" value={addSchedule.room} onChange={e => setAddSchedule({ ...addSchedule, room: e.target.value })} placeholder="Phòng học" />
                </div>
                <button type="button" onClick={addSch} className="btn-secondary text-sm mt-2 w-full">+ Thêm lịch</button>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4" />
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
