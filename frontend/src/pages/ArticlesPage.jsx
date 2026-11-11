import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FiArrowRight, FiEdit3, FiPlus, FiSearch } from 'react-icons/fi';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import '../styles/articles.css';

export const articleCategories = ['SEO web', 'Bài toán & lời giải', 'Kiến thức', 'Chia sẻ', 'Khác'];
export const articleDate = value => value ? new Date(value).toLocaleDateString('vi-VN') : '';

export default function ArticlesPage() {
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const [result, setResult] = useState({ articles: [], pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(params.get('q') || '');
  const [retry, setRetry] = useState(0);
  const manage = isAdmin && params.get('manage') === 'true';
  const page = Math.max(1, Number(params.get('page')) || 1);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    api.get('/articles', { params: { q: params.get('q') || '', category: params.get('category') || '', page, manage }, signal: controller.signal })
      .then(({ data }) => setResult(data)).catch(e => { if (!controller.signal.aborted) setError(e.response?.data?.message || 'Không tải được bài viết.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [params, manage, page, retry]);
  function filter(key, value) {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  }
  return <><Navbar /><main className="articles-shell">
    <div className="articles-heading"><div><p className="articles-eyebrow">GÓC KIẾN THỨC</p><h1>Bài viết & lời giải</h1><p>Khám phá kiến thức, lời giải toán và những chia sẻ từ thầy.</p></div>
      {isAdmin && <Link className="btn-primary articles-action" to="/new/write"><FiPlus /> Viết bài mới</Link>}</div>
    <form className="articles-filters" onSubmit={e => { e.preventDefault(); filter('q', search); }}>
      <div className="articles-search"><FiSearch /><input aria-label="Tìm bài viết" placeholder="Tìm bài viết, lời giải..." value={search} onChange={e => setSearch(e.target.value)} /><button className="btn-secondary" type="submit">Tìm</button></div>
      <select aria-label="Chuyên mục" className="input-field" value={params.get('category') || ''} onChange={e => filter('category', e.target.value)}><option value="">Tất cả chuyên mục</option>{articleCategories.map(c => <option key={c}>{c}</option>)}</select>
      {isAdmin && <label className="articles-toggle"><input type="checkbox" checked={manage} onChange={e => filter('manage', e.target.checked ? 'true' : '')} /> Hiện cả bản nháp</label>}
    </form>
    {loading ? <p role="status" className="articles-empty">Đang tải bài viết...</p> : error ? <div role="alert" className="articles-empty"><p>{error}</p><button className="btn-secondary" onClick={() => setRetry(v => v + 1)}>Thử lại</button></div> : result.articles.length === 0 ? <div className="articles-empty"><h2>Chưa có bài viết</h2><p>{params.get('q') || params.get('category') ? 'Thử tìm kiếm hoặc chọn chuyên mục khác.' : 'Những bài viết mới sẽ sớm xuất hiện tại đây.'}</p></div> : <div className="articles-grid">{result.articles.map(a => <article className="article-card" key={a._id}>
      <div className="articles-badges"><span>{a.category}</span>{a.status === 'draft' && <span>Bản nháp</span>}</div><h2><Link to={`/new/${a.slug}`}>{a.title}</Link></h2><p>{a.excerpt || 'Đọc bài viết để khám phá nội dung chi tiết.'}</p><small>{a.author?.name} · {articleDate(a.publishedAt || a.createdAt)}</small>
      <div className="article-card-footer"><Link to={`/new/${a.slug}`}>Đọc bài viết <FiArrowRight /></Link>{isAdmin && <Link aria-label={`Sửa ${a.title}`} to={`/new/${a.slug}/edit`}><FiEdit3 /> Sửa</Link>}</div>
    </article>)}</div>}
    {!loading && !error && result.pages > 1 && <nav className="articles-pagination" aria-label="Phân trang bài viết"><button className="btn-secondary" disabled={page <= 1} onClick={() => filter('page', String(page - 1))}>Trang trước</button><span>Trang {page} / {result.pages}</span><button className="btn-secondary" disabled={page >= result.pages} onClick={() => filter('page', String(page + 1))}>Trang sau</button></nav>}
  </main></>;
}
