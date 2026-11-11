import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import Navbar from '../../components/Navbar';
import RichTextEditor from '../../components/RichTextEditor';
import ArticleContent from '../../components/ArticleContent';
import { articleCategories } from '../ArticlesPage';
import api from '../../api/axios';
import '../../styles/articles.css';

const empty = { title: '', slug: '', category: 'Bài toán & lời giải', excerpt: '', content: '', seoTitle: '', seoDescription: '', status: 'draft' };
const slugify = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 180).replace(/-$/, '');

export default function AdminArticleEditor() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [id, setId] = useState(null);
  const [loading, setLoading] = useState(Boolean(slug));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const saving = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setForm(empty); setId(null); setDirty(false); setError(''); setLoading(Boolean(slug));
    if (slug) api.get(`/articles/${slug}`, { signal: controller.signal }).then(({ data }) => {
      setForm(Object.fromEntries(Object.keys(empty).map(key => [key, data[key] || empty[key]]))); setId(data._id);
    }).catch(e => { if (!controller.signal.aborted) setError(e.response?.data?.message || 'Không tải được bài viết.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slug]);
  useEffect(() => {
    if (!dirty) return;
    const warn = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function change(key, value) { setForm(f => ({ ...f, [key]: value })); setDirty(true); }
  async function save(status) {
    if (saving.current || uploading) return;
    if (!form.title.trim()) return toast.error('Vui lòng nhập tiêu đề.');
    saving.current = true; setBusy(true);
    try {
      const payload = { ...form, slug: form.slug || slugify(form.title), status };
      const { data } = id ? await api.put(`/articles/${id}`, payload) : await api.post('/articles', payload);
      setDirty(false); toast.success(status === 'published' ? 'Đã đăng bài viết.' : 'Đã lưu bản nháp.');
      navigate(`/new/${data.slug}/edit`, { replace: true });
      setId(data._id); setForm(f => ({ ...f, slug: data.slug, status: data.status }));
    } catch (e) { toast.error(e.response?.data?.message || 'Không lưu được bài viết.'); }
    finally { saving.current = false; setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(`Xóa vĩnh viễn bài viết “${form.title}”?`)) return;
    setBusy(true);
    try { await api.delete(`/articles/${id}`); setDirty(false); toast.success('Đã xóa bài viết.'); navigate('/new?manage=true'); }
    catch (e) { toast.error(e.response?.data?.message || 'Không xóa được bài viết.'); setBusy(false); }
  }
  const field = (key, label, maxLength, multiline = false, placeholder = '') => <label className="article-field">{label}{multiline ? <textarea className="input-field" rows={3} value={form[key]} maxLength={maxLength} placeholder={placeholder} onChange={e => change(key, e.target.value)} /> : <input className="input-field" value={form[key]} maxLength={maxLength} placeholder={placeholder} onChange={e => change(key, e.target.value)} />}</label>;
  return <><Navbar /><main className="articles-shell article-editor-shell"><Link className="articles-back" to="/new?manage=true" onClick={e => { if (dirty && !window.confirm('Bạn có thay đổi chưa lưu. Rời trang?')) e.preventDefault(); }}>← Quản lý bài viết</Link>
    <div className="articles-heading"><div><p className="articles-eyebrow">DÀNH CHO QUẢN TRỊ VIÊN</p><h1>{slug ? 'Chỉnh sửa bài viết' : 'Viết bài mới'}</h1><p>Chia sẻ lời giải toán, kiến thức và nội dung của bạn.</p></div>{!loading && !error && <span className="article-status" role="status">{dirty ? 'Có thay đổi chưa lưu' : form.status === 'published' ? 'Đã xuất bản' : id ? 'Đã lưu nháp' : 'Bản nháp mới'}</span>}</div>
    {loading ? <p role="status">Đang tải bài viết...</p> : error ? <p role="alert">{error}</p> : <form onSubmit={e => { e.preventDefault(); save('published'); }}>
      <fieldset disabled={busy} className="article-editor-grid"><div className="article-editor-main">
        <section className="article-panel">{field('title', 'Tiêu đề bài viết *', 200, false, 'Ví dụ: Cách giải phương trình bậc hai')}{field('excerpt', 'Tóm tắt bài viết', 500, true, 'Giới thiệu ngắn để người đọc biết nội dung bài viết...')}</section>
        <section className="article-panel"><div className="article-editor-toolbar"><h2>Nội dung bài viết</h2><button className="btn-secondary" type="button" onClick={() => setPreview(v => !v)}>{preview ? 'Tiếp tục soạn' : 'Xem trước'}</button></div><p className="article-hint">Chèn ảnh và công thức bằng thanh công cụ. Có thể viết công thức dạng $x^2$ hoặc $$x^2$$.</p>
          <div hidden={preview}><RichTextEditor value={form.content} onChange={value => change('content', value)} onUploadingChange={setUploading} placeholder="Bắt đầu viết bài của bạn..." /></div>{preview && <div className="article-preview"><h1>{form.title || 'Tiêu đề bài viết'}</h1><p className="article-lead">{form.excerpt}</p><ArticleContent content={form.content} /></div>}
        </section>
      </div><aside className="article-editor-side">
        <section className="article-panel"><h2>Đăng bài</h2><label className="article-field">Chuyên mục<select className="input-field" value={form.category} onChange={e => change('category', e.target.value)}>{articleCategories.map(c => <option key={c}>{c}</option>)}</select></label>
          {field('slug', 'Đường dẫn bài viết', 200, false, slugify(form.title) || 'duong-dan-bai-viet')}<p className="article-hint">/new/{slugify(form.slug || form.title) || 'duong-dan-bai-viet'}</p>
          <button className="btn-primary" type="submit" disabled={busy || uploading}>{busy ? 'Đang xử lý...' : form.status === 'published' ? 'Cập nhật bài viết' : 'Xuất bản bài viết'}</button>
          <button className="btn-secondary" type="button" disabled={busy || uploading} onClick={() => save('draft')}>{form.status === 'published' ? 'Chuyển về bản nháp' : 'Lưu bản nháp'}</button>
          {uploading && <p role="status" className="article-hint">Đang tải ảnh, vui lòng đợi trước khi lưu.</p>}
          {id && <><Link className="articles-back" to={`/new/${slug}`}>Xem bài đã lưu ↗</Link><button type="button" className="article-delete" onClick={remove} disabled={busy}>Xóa bài viết</button></>}
        </section>
        <section className="article-panel"><h2>Thông tin SEO</h2>{field('seoTitle', 'Tiêu đề SEO', 200, false, form.title || 'Mặc định dùng tiêu đề bài viết')}{field('seoDescription', 'Mô tả SEO', 500, true, 'Mặc định dùng phần tóm tắt')}<p className="article-hint">Gợi ý: tiêu đề khoảng 50–60 ký tự, mô tả khoảng 150–160 ký tự.</p><div className="article-seo-preview"><b>{form.seoTitle || form.title || 'Tiêu đề bài viết'} | Toán Thầy Hiếu</b><small>/new/{slugify(form.slug || form.title)}</small><p>{form.seoDescription || form.excerpt || 'Mô tả ngắn của bài viết.'}</p></div></section>
      </aside></fieldset>
    </form>}
  </main></>;
}
