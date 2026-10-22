import { useState } from 'react';
import { FiUpload, FiX, FiDownload } from 'react-icons/fi';
import api, { getUploadUrl } from '../api/axios';

export default function PdfUploader({ attachments = [], onAttachmentsChange, onUploadingChange }) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const uploadedAttachments = [...attachments];
    setIsUploading(true);
    onUploadingChange?.(true);
    setError('');

    try {
      for (const file of files) {
        if (file.type !== 'application/pdf') {
          setError('Chỉ chấp nhận file PDF');
          continue;
        }

        if (file.size > 50 * 1024 * 1024) {
          setError('File không được vượt quá 50MB');
          continue;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
          const res = await api.post('/upload', formData);
          uploadedAttachments.push({ url: res.data.url, filename: file.name, uploadedAt: new Date() });
          onAttachmentsChange([...uploadedAttachments]);
        } catch (err) {
          setError('Tải file lên thất bại: ' + (err.response?.data?.message || err.message));
        }
      }
    } finally {
      setIsUploading(false);
      onUploadingChange?.(false);
      e.target.value = '';
    }
  };

  const handleRemove = (index) => {
    onAttachmentsChange(attachments.filter((_, i) => i !== index));
  };

  return (
    <div className="mt-4 p-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
      <div className="flex items-center gap-2 mb-3">
        <FiUpload className="text-blue-500" size={18} />
        <label className="text-sm font-semibold text-gray-700 cursor-pointer">
          Tải lên PDF
          <input
            type="file"
            accept=".pdf"
            multiple
            onChange={handleFileUpload}
            disabled={isUploading}
            className="hidden"
          />
        </label>
      </div>

      {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

      {attachments.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-gray-700 mb-2">File đã tải ({attachments.length}):</p>
          <ul className="space-y-2">
            {attachments.map((att, idx) => (
              <li key={idx} className="flex items-center justify-between bg-white p-2 rounded border border-gray-200">
                <a href={getUploadUrl(att.url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline text-sm">
                  <FiDownload size={14} />
                  {att.filename}
                </a>
                <button
                  onClick={() => handleRemove(idx)}
                  className="text-red-500 hover:text-red-700 p-1"
                  type="button"
                  disabled={isUploading}
                >
                  <FiX size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isUploading && <p className="text-blue-500 text-sm mt-2">Đang tải lên...</p>}
    </div>
  );
}
