import { useMemo, useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api, { getUploadUrl } from '../api/axios';
import toast from 'react-hot-toast';
import { FiUpload, FiX, FiCheck, FiClock, FiBook, FiEye, FiEdit2, FiTrendingUp, FiTrendingDown, FiMinus, FiBarChart2 } from 'react-icons/fi';
import { compressImageFile } from '../utils/imageCompression';

function HomeworkScoreChart({ data }) {
  const [hovered, setHovered] = useState(null);
  const W = 640;
  const H = 230;
  const pL = 42;
  const pR = 18;
  const pT = 26;
  const pB = 48;
  const cW = W - pL - pR;
  const cH = H - pT - pB;
  const grid = [0, 2.5, 5, 7.5, 10];
  const n = data.length;
  const getX = (i) => n > 1 ? pL + (i / (n - 1)) * cW : pL + cW / 2;
  const getY = (score) => pT + cH - (score / 10) * cH;
  const fmtDate = (date) => new Date(date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  const scoreColor = (score) => score >= 8 ? '#16a34a' : score >= 6.5 ? '#2563eb' : score >= 5 ? '#f59e0b' : '#ef4444';

  const points = data.map((item, index) => ({ x: getX(index), y: getY(item.score10) }));
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const areaPath = n > 1
    ? `${linePath} L ${points[n - 1].x.toFixed(1)} ${(pT + cH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(pT + cH).toFixed(1)} Z`
    : '';

  if (n === 0) {
    return (
      <div className="h-36 flex flex-col items-center justify-center gap-2 text-sm text-gray-400">
        <FiBarChart2 size={30} className="text-gray-300" />
        Chưa có bài tập nào được chấm điểm để vẽ biểu đồ
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-visible">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block">
        <defs>
          <linearGradient id="homeworkScoreFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.02" />
          </linearGradient>
          <filter id="homeworkScoreShadow">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.18" />
          </filter>
        </defs>

        {grid.map(value => (
          <g key={value}>
            <line
              x1={pL}
              y1={getY(value)}
              x2={W - pR}
              y2={getY(value)}
              stroke={value === 0 ? '#d1d5db' : '#edf2f7'}
              strokeWidth={value === 0 ? 1.5 : 1}
            />
            <text x={pL - 7} y={getY(value) + 4} textAnchor="end" fontSize="10" fill="#9ca3af">
              {value}
            </text>
          </g>
        ))}

        {n > 1 && <path d={areaPath} fill="url(#homeworkScoreFill)" />}
        {n > 1 && <path d={linePath} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

        {data.map((item, index) => {
          const point = points[index];
          const color = scoreColor(item.score10);
          const isHovered = hovered === index;
          const ttW = 170;
          const ttH = 58;
          let tx = point.x - ttW / 2;
          if (tx < pL) tx = pL;
          if (tx + ttW > W - pR) tx = W - pR - ttW;
          const ty = point.y - ttH - 12 < pT ? point.y + 14 : point.y - ttH - 12;

          return (
            <g
              key={item.id}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              className="cursor-pointer"
            >
              <circle cx={point.x} cy={point.y} r={16} fill="transparent" />
              <circle
                cx={point.x}
                cy={point.y}
                r={isHovered ? 7 : 5}
                fill="white"
                stroke={color}
                strokeWidth="2.5"
                filter={isHovered ? 'url(#homeworkScoreShadow)' : undefined}
              />
              <text x={point.x} y={point.y - 10} textAnchor="middle" fontSize="10" fontWeight="700" fill={color}>
                {item.score10}/10
              </text>
              <text x={point.x} y={H - 10} textAnchor="middle" fontSize="10" fill="#9ca3af">
                {fmtDate(item.date)}
              </text>

              {isHovered && (
                <g>
                  <rect x={tx} y={ty} width={ttW} height={ttH} rx="6" fill="white" stroke="#e5e7eb" filter="url(#homeworkScoreShadow)" />
                  <text x={tx + ttW / 2} y={ty + 17} textAnchor="middle" fontSize="11" fontWeight="700" fill={color}>
                    {item.score}/{item.maxScore} điểm
                  </text>
                  <text x={tx + ttW / 2} y={ty + 33} textAnchor="middle" fontSize="10" fill="#6b7280">
                    {item.title.length > 24 ? `${item.title.slice(0, 22)}...` : item.title}
                  </text>
                  <text x={tx + ttW / 2} y={ty + 48} textAnchor="middle" fontSize="9.5" fill="#9ca3af">
                    {new Date(item.date).toLocaleDateString('vi-VN')}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function StudentHomeworkPage() {
  const { user } = useAuth();
  const [homeworks, setHomeworks] = useState([]);
  const [submissions, setSubmissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState(null);
  const [expandedHw, setExpandedHw] = useState(null);
  const [uploadingImages, setUploadingImages] = useState({});
  const [previewImage, setPreviewImage] = useState(null);

  const scoreChartData = useMemo(() => {
    return homeworks
      .map((hw) => {
        const sub = submissions[hw._id];
        const score = Number(sub?.score);
        const maxScore = Number(sub?.maxScore || hw.maxScore || 10);
        if (sub?.status !== 'graded' || !Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
          return null;
        }

        const date = sub.gradedAt || sub.updatedAt || sub.submittedAt || hw.createdAt;
        return {
          id: hw._id,
          title: hw.title,
          date,
          score,
          maxScore,
          score10: Math.round((score / maxScore) * 100) / 10,
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [homeworks, submissions]);

  const scoreSummary = useMemo(() => {
    if (scoreChartData.length === 0) {
      return {
        avg: 0,
        latest: null,
        trend: 'empty',
        text: 'Chưa có dữ liệu',
        note: 'Khi có bài đã chấm, biểu đồ sẽ thể hiện điểm theo thời gian.',
        color: 'text-gray-600',
        bg: 'bg-gray-100',
        icon: FiBarChart2,
      };
    }

    const avg = scoreChartData.reduce((sum, item) => sum + item.score10, 0) / scoreChartData.length;
    const latest = scoreChartData[scoreChartData.length - 1];
    const previous = scoreChartData[scoreChartData.length - 2];
    const delta = previous ? latest.score10 - previous.score10 : 0;

    if (!previous || Math.abs(delta) < 0.3) {
      return {
        avg,
        latest,
        trend: 'stable',
        text: 'Đang ổn định',
        note: previous ? 'Điểm gần đây không thay đổi nhiều so với bài trước.' : 'Cần thêm bài đã chấm để nhận xét xu hướng rõ hơn.',
        color: 'text-blue-700',
        bg: 'bg-blue-50',
        icon: FiMinus,
      };
    }

    if (delta > 0) {
      return {
        avg,
        latest,
        trend: 'up',
        text: 'Đang tiến bộ',
        note: `Bài gần nhất tăng ${delta.toFixed(1)} điểm trên thang 10 so với bài trước.`,
        color: 'text-green-700',
        bg: 'bg-green-50',
        icon: FiTrendingUp,
      };
    }

    return {
      avg,
      latest,
      trend: 'down',
      text: 'Có dấu hiệu giảm',
      note: `Bài gần nhất giảm ${Math.abs(delta).toFixed(1)} điểm trên thang 10 so với bài trước.`,
      color: 'text-amber-700',
      bg: 'bg-amber-50',
      icon: FiTrendingDown,
    };
  }, [scoreChartData]);

  const loadHomeworks = async () => {
    setLoading(true);
    try {
      // Get student's homeworks from their enrolled classes
      const { data: allHomeworks } = await api.get('/homeworks/student/list');
      setHomeworks(allHomeworks || []);

      // Load submissions for each homework
      const subs = {};
      for (const hw of allHomeworks || []) {
        try {
          const { data } = await api.get(`/homeworks/${hw._id}/my-submission`);
          subs[hw._id] = data;
        } catch (err) {
          // No submission yet (404 is normal)
          subs[hw._id] = null;
        }
      }
      setSubmissions(subs);
    } catch (err) {
      console.error('Homework load error:', err);
      toast.error(err.response?.data?.message || 'Lỗi tải bài tập');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHomeworks();
  }, []);

  const handleImageUpload = async (files, homeworkId) => {
    if (!files || files.length === 0) return;

    setUploadingImages(prev => ({ ...prev, [homeworkId]: true }));
    try {
      const uploadedImages = [];

      for (const file of files) {
        const compressedFile = await compressImageFile(file);
        const formData = new FormData();
        formData.append('file', compressedFile);
        const { data } = await api.post('/upload/image', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        uploadedImages.push({ url: data.url, uploadedAt: new Date() });
      }

      // Get current submission or create new one
      const currentSub = submissions[homeworkId];
      const existingImages = currentSub?.submissionImages || [];
      const allImages = [...existingImages, ...uploadedImages];

      // Submit homework
      const { data } = await api.post(`/homeworks/${homeworkId}/submit`, {
        submissionImages: allImages
      });

      setSubmissions(prev => ({
        ...prev,
        [homeworkId]: data
      }));

      toast.success('Tải ảnh thành công!');
    } catch (err) {
      console.error('Upload error:', err);
      toast.error(err.response?.data?.message || 'Lỗi tải ảnh');
    } finally {
      setUploadingImages(prev => ({ ...prev, [homeworkId]: false }));
    }
  };

  const handleRemoveImage = async (homeworkId, imageIndex) => {
    try {
      const currentSub = submissions[homeworkId];
      const newImages = currentSub.submissionImages.filter((_, idx) => idx !== imageIndex);

      const { data } = await api.post(`/homeworks/${homeworkId}/submit`, {
        submissionImages: newImages
      });

      setSubmissions(prev => ({
        ...prev,
        [homeworkId]: data
      }));

      toast.success('Xóa ảnh thành công');
    } catch (err) {
      console.error('Remove image error:', err);
      toast.error(err.response?.data?.message || 'Lỗi xóa ảnh');
    }
  };

  const handleReplaceImage = async (file, homeworkId, imageIndex) => {
    if (!file) return;

    setUploadingImages(prev => ({ ...prev, [homeworkId]: true }));
    try {
      const compressedFile = await compressImageFile(file);
      const formData = new FormData();
      formData.append('file', compressedFile);
      const { data: uploaded } = await api.post('/upload/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const currentSub = submissions[homeworkId];
      const nextImages = [...(currentSub?.submissionImages || [])];
      nextImages[imageIndex] = { url: uploaded.url, uploadedAt: new Date() };

      const { data } = await api.post(`/homeworks/${homeworkId}/submit`, {
        submissionImages: nextImages
      });

      setSubmissions(prev => ({
        ...prev,
        [homeworkId]: data
      }));

      toast.success('Đổi ảnh thành công');
    } catch (err) {
      console.error('Replace image error:', err);
      toast.error(err.response?.data?.message || 'Lỗi đổi ảnh');
    } finally {
      setUploadingImages(prev => ({ ...prev, [homeworkId]: false }));
    }
  };

  const getStatus = (submission) => {
    if (!submission) return { text: 'Chưa nộp', color: 'text-gray-500', bg: 'bg-gray-100' };
    if (submission.status === 'graded') {
      return { text: `Đã chấm: ${submission.score}/${submission.maxScore}`, color: 'text-green-600', bg: 'bg-green-100' };
    }
    return { text: 'Chờ chấm', color: 'text-yellow-600', bg: 'bg-yellow-100' };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Đang tải bài tập...</p>
        </div>
      </div>
    );
  }

  const TrendIcon = scoreSummary.icon;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-2">
          <FiBook className="text-blue-600" /> Bài tập về nhà
        </h1>
        <p className="text-gray-600 mb-8">Nộp và theo dõi tiến độ bài tập của bạn</p>

        <div className="bg-white rounded-lg shadow-md p-5 mb-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <FiBarChart2 className="text-blue-600" /> Biểu đồ điểm bài tập
              </h2>
              <p className="text-sm text-gray-500 mt-1">Theo dõi điểm đã chấm để xem con đang tiến bộ, ổn định hay cần chú ý thêm.</p>
            </div>
            <div className={`rounded-lg px-4 py-3 ${scoreSummary.bg} min-w-[190px]`}>
              <div className={`flex items-center gap-2 text-sm font-semibold ${scoreSummary.color}`}>
                <TrendIcon size={16} /> {scoreSummary.text}
              </div>
              <p className="text-xs text-gray-600 mt-1">{scoreSummary.note}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-500">Bài đã chấm</p>
              <p className="text-xl font-bold text-gray-900">{scoreChartData.length}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-500">Điểm trung bình</p>
              <p className="text-xl font-bold text-blue-600">{scoreChartData.length ? scoreSummary.avg.toFixed(1) : '--'}/10</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-3 col-span-2 md:col-span-1">
              <p className="text-xs text-gray-500">Bài gần nhất</p>
              <p className="text-xl font-bold text-green-600">{scoreSummary.latest ? `${scoreSummary.latest.score10}/10` : '--'}</p>
            </div>
          </div>

          <HomeworkScoreChart data={scoreChartData} />
        </div>

        {homeworks.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
            Chưa có bài tập nào được giao
          </div>
        ) : (
          <div className="space-y-4">
            {homeworks.map((hw) => {
              const sub = submissions[hw._id];
              const status = getStatus(sub);
              const isExpanded = expandedHw === hw._id;

              return (
                <div
                  key={hw._id}
                  className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition"
                >
                  {/* Header */}
                  <button
                    onClick={() => setExpandedHw(isExpanded ? null : hw._id)}
                    className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition"
                  >
                    <div className="text-left flex-1">
                      <h2 className="text-lg font-semibold text-gray-900">{hw.title}</h2>
                      <p className="text-sm text-gray-600 mt-1">
                        Lớp: {hw.class?.name} | Điểm tối đa: {hw.maxScore}
                      </p>
                      {hw.dueDate && (
                        <p className="text-sm text-gray-500 mt-1">
                          Hạn chót: {new Date(hw.dueDate).toLocaleDateString('vi-VN')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${status.bg} ${status.color} flex items-center gap-1`}>
                        {sub?.status === 'graded' ? <FiCheck /> : <FiClock />}
                        {status.text}
                      </span>
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 p-4 bg-gray-50">
                      {/* Description */}
                      {hw.description && (
                        <div className="mb-6">
                          <h3 className="font-medium text-gray-900 mb-2">Đề bài:</h3>
                          <p className="text-gray-700 whitespace-pre-wrap">{hw.description}</p>
                        </div>
                      )}

                      {/* Question Image */}
                      {hw.questionImage?.url && (
                        <div className="mb-6">
                          <h3 className="font-medium text-gray-900 mb-2">Ảnh đề bài:</h3>
                          <button
                            onClick={() => setPreviewImage(getUploadUrl(`${import.meta.env.VITE_API_URL}/${hw.questionImage.url}`))}
                            className="relative inline-block group"
                          >
                            <img
                              src={getUploadUrl(`${import.meta.env.VITE_API_URL}/${hw.questionImage.url}`)}
                              alt="Question"
                              className="max-w-md h-auto rounded border border-gray-300 cursor-pointer hover:opacity-75 transition"
                            />
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                              <FiEye className="text-white" size={24} />
                            </div>
                          </button>
                        </div>
                      )}

                      {/* Current Submission Images */}
                      {sub?.submissionImages && sub.submissionImages.length > 0 && (
                        <div className="mb-6">
                          <h3 className="font-medium text-gray-900 mb-2">
                            Bài làm của bạn ({sub.submissionImages.length} ảnh):
                          </h3>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {sub.submissionImages.map((img, idx) => (
                              <div key={idx} className="relative group">
                                <button
                                  onClick={() => setPreviewImage(getUploadUrl(`${import.meta.env.VITE_API_URL}/${img.url}`))}
                                  className="w-full relative"
                                >
                                  <img
                                    src={getUploadUrl(`${import.meta.env.VITE_API_URL}/${img.url}`)}
                                    alt={`Submission ${idx + 1}`}
                                    className="w-full h-32 object-cover rounded border border-gray-300 cursor-pointer hover:opacity-75 transition"
                                  />
                                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                    <FiEye className="text-white" size={20} />
                                  </div>
                                </button>
                                {sub.status !== 'graded' && (
                                  <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                    <label
                                      className="bg-white text-blue-600 rounded-full p-1 shadow cursor-pointer hover:bg-blue-50"
                                      title="Đổi ảnh"
                                    >
                                      <FiEdit2 size={14} />
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => {
                                          handleReplaceImage(e.target.files?.[0], hw._id, idx);
                                          e.target.value = '';
                                        }}
                                        className="hidden"
                                      />
                                    </label>
                                    <button
                                      onClick={() => handleRemoveImage(hw._id, idx)}
                                      className="bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                                      title="Xóa ảnh"
                                    >
                                      <FiX size={14} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Upload Section */}
                      {sub?.status !== 'graded' && (
                        <div className="mb-6">
                          <h3 className="font-medium text-gray-900 mb-2">Tải lên bài làm:</h3>
                          <label className="border-2 border-dashed border-blue-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition block">
                            <input
                              type="file"
                              multiple
                              accept="image/*"
                              onChange={(e) => {
                                if (e.target.files) {
                                  handleImageUpload(Array.from(e.target.files), hw._id);
                                }
                              }}
                              disabled={uploadingImages[hw._id]}
                              className="hidden"
                            />
                            {uploadingImages[hw._id] ? (
                              <div className="space-y-2">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                                <p className="text-sm text-gray-600">Đang tải...</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <FiUpload size={32} className="mx-auto text-blue-500" />
                                <p className="text-sm text-gray-700">
                                  Chọn hoặc kéo ảnh bài làm vào đây
                                </p>
                                <p className="text-xs text-gray-500">
                                  Hỗ trợ JPG, PNG, GIF, WebP. Tối đa 5MB mỗi file.
                                </p>
                              </div>
                            )}
                          </label>
                        </div>
                      )}

                      {/* Feedback Section */}
                      {sub?.status === 'graded' && (
                        <div className="bg-white rounded-lg p-4 border border-green-200">
                          <h3 className="font-medium text-gray-900 mb-3">Kết quả chấm điểm:</h3>
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                              <p className="text-sm text-gray-600">Điểm</p>
                              <p className="text-2xl font-bold text-green-600">
                                {sub.score}/{hw.maxScore}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Chấm ngày</p>
                              <p className="text-sm text-gray-900">
                                {new Date(sub.gradedAt).toLocaleDateString('vi-VN')}
                              </p>
                            </div>
                          </div>

                          {sub.feedback && (
                            <div>
                              <p className="text-sm font-medium text-gray-700 mb-2">Nhận xét:</p>
                              <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded whitespace-pre-wrap">
                                {sub.feedback}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="max-w-2xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 bg-white rounded-full p-2 hover:bg-gray-100"
            >
              <FiX size={24} />
            </button>
            <img
              src={previewImage}
              alt="Preview"
              className="w-full h-full object-contain rounded"
            />
          </div>
        </div>
      )}
    </div>
  );
}
