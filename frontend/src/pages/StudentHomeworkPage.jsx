import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api, { getUploadUrl } from '../api/axios';
import toast from 'react-hot-toast';
import { FiUpload, FiX, FiCheck, FiClock, FiBook, FiEye, FiEdit2 } from 'react-icons/fi';
import { compressImageFile } from '../utils/imageCompression';

export default function StudentHomeworkPage() {
  const { user } = useAuth();
  const [homeworks, setHomeworks] = useState([]);
  const [submissions, setSubmissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState(null);
  const [expandedHw, setExpandedHw] = useState(null);
  const [uploadingImages, setUploadingImages] = useState({});
  const [previewImage, setPreviewImage] = useState(null);

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

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-2">
          <FiBook className="text-blue-600" /> Bài tập về nhà
        </h1>
        <p className="text-gray-600 mb-8">Nộp và theo dõi tiến độ bài tập của bạn</p>

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
