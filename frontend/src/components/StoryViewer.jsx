import { useEffect, useRef, useState } from 'react';
import { FiX, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { Avatar, CommunityImage } from './CommunityWidgets';
import '../styles/story-viewer.css';

export default function StoryViewer({ storyId, onClose, onDeleted }) {
  const { user, isAdmin } = useAuth();
  const dialog = useRef();
  const [story, setStory] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    const controller = new AbortController();
    api.get(`/community/posts/${storyId}`, { signal: controller.signal }).then(({ data }) => {
      if (data.kind !== 'story') { setError('Không tìm thấy tin.'); return; }
      setStory(data);
    }).catch(error => { if (!controller.signal.aborted) setError(error.response?.data?.message || 'Không thể tải tin.'); });
    return () => controller.abort();
  }, [storyId]);
  useEffect(() => {
    if (!story?.expiresAt) return;
    const timer = setTimeout(() => { setStory(null); setError('Tin đã hết hạn.'); }, Math.max(0, new Date(story.expiresAt).getTime() - Date.now()));
    return () => clearTimeout(timer);
  }, [story]);
  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await api.delete(`/community/posts/${storyId}`);
      toast.success('Đã xóa tin.');
      await onDeleted?.();
      dialog.current?.close();
    } catch (error) { toast.error(error.response?.data?.message || 'Không thể xóa tin.'); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="locket-story-viewer" aria-labelledby="story-viewer-title" onClose={onClose} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
    <div className="locket-story-viewer-header">
      <div className="locket-story-viewer-author">{story && <Avatar person={story.author} frame={story.frame} />}<div><h2 id="story-viewer-title">{story?.author?.name || 'Tin 24 giờ'}</h2>{story && <small>{new Date(story.createdAt).toLocaleString('vi-VN')}</small>}</div></div>
      {story && (isAdmin || story.author?._id === user?._id) && <button type="button" disabled={busy} onClick={remove} className="locket-story-delete"><FiTrash2 /> {busy ? 'Đang xóa…' : 'Xóa tin'}</button>}
      <button type="button" className="locket-story-close" aria-label="Đóng ảnh tin" onClick={() => dialog.current?.close()}><FiX /></button>
    </div>
    {error ? <p role="alert" className="locket-story-viewer-message">{error}</p> : !story ? <p role="status" className="locket-story-viewer-message">Đang tải tin…</p> : story.image ? <CommunityImage key={story._id} post={story._id} className="locket-story-full-image" /> : <p className="locket-story-viewer-message">{story.text}</p>}
  </dialog>;
}
