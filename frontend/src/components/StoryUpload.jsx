import { useEffect, useRef, useState } from 'react';
import { FiPlus } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../api/axios';

export default function StoryUpload({ imageLimitReached, onPosted }) {
  const fileInput = useRef(), dialog = useRef();
  const [image, setImage] = useState(null), [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!image) { setPreview(''); return; }
    const url = URL.createObjectURL(image); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  function chooseImage(event) {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size > 5 * 1024 * 1024) {
      toast.error('Chọn ảnh JPEG, PNG hoặc WebP tối đa 5 MB'); return;
    }
    setImage(selected); dialog.current?.showModal();
  }
  async function postStory(event) {
    event.preventDefault();
    if (busy || !image) return;
    setBusy(true);
    try {
      const data = new FormData();
      // Keep uploads compatible with API versions that still require a text field.
      data.append('kind', 'story'); data.append('text', 'Tin 24 giờ'); data.append('image', image); data.append('hasImage', 'true');
      await api.post('/community/posts', data);
      dialog.current?.close();
      toast.success('Đã đăng tin!');
      await onPosted();
    } catch (error) { toast.error(error.response?.data?.message || 'Không thể đăng tin. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" className="locket-story" disabled={busy} onClick={() => {
      if (imageLimitReached) { toast.error('Bạn đã hết lượt đăng ảnh hôm nay.'); return; }
      fileInput.current?.click();
    }}><span className="locket-story-add"><FiPlus /></span><span>Tin của bạn</span></button>
    <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Chọn ảnh đăng tin 24 giờ" onChange={chooseImage} />
    <dialog ref={dialog} className="locket-publish-dialog locket-story-dialog" aria-labelledby="story-upload-title" onClose={() => setImage(null)} onCancel={event => { if (busy) event.preventDefault(); }}>
      <form onSubmit={postStory}>
        <h2 id="story-upload-title">Đăng tin của bạn</h2>
        <p>Tin hiển thị ngay trong 24 giờ. Ảnh hết hạn được tự xóa lúc 00:00 hằng ngày (giờ Việt Nam).</p>
        {preview && <img src={preview} className="locket-story-preview" alt="Xem trước ảnh đăng tin" />}
        <div className="locket-publish-actions"><button type="button" className="community-button" disabled={busy} onClick={() => dialog.current?.close()}>Hủy</button><button type="submit" className="community-button" disabled={busy || !image}>{busy ? 'Đang đăng…' : 'Đăng tin'}</button></div>
      </form>
    </dialog>
  </>;
}
