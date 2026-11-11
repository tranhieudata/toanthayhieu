import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ArticleContent from '../components/ArticleContent';
import { useAuth } from '../context/AuthContext';
import { articleDate } from './ArticlesPage';
import api from '../api/axios';
import '../styles/articles.css';

export default function ArticlePage() {
  const { slug } = useParams();
  const { isAdmin } = useAuth();
  const [article, setArticle] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setArticle(null); setError('');
    api.get(`/articles/${slug}`, { signal: controller.signal }).then(({ data }) => setArticle(data)).catch(e => { if (!controller.signal.aborted) setError(e.response?.data?.message || 'Không tải được bài viết.'); });
    return () => controller.abort();
  }, [slug]);
  useEffect(() => {
    if (!article) return;
    const title = document.title;
    document.title = `${article.seoTitle || article.title} | Toán Thầy Hiếu`;
    const nodes = [];
    const saved = [];
    const meta = (selector, tag, attrs) => {
      let node = document.head.querySelector(selector);
      if (node) saved.push([node, node.cloneNode()]);
      else { node = document.createElement(tag); document.head.appendChild(node); nodes.push(node); }
      Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    };
    meta('meta[name="description"]', 'meta', { name: 'description', content: article.seoDescription || article.excerpt || article.title });
    meta('link[rel="canonical"]', 'link', { rel: 'canonical', href: `${location.origin}/new/${article.slug}` });
    if (article.status === 'draft') meta('meta[name="robots"]', 'meta', { name: 'robots', content: 'noindex,nofollow' });
    const schema = document.createElement('script'); schema.type = 'application/ld+json';
    schema.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: article.title, description: article.seoDescription || article.excerpt, datePublished: article.publishedAt, dateModified: article.updatedAt, author: { '@type': 'Person', name: article.author?.name || 'Toán Thầy Hiếu' } });
    document.head.appendChild(schema); nodes.push(schema);
    return () => { document.title = title; nodes.forEach(n => n.remove()); saved.forEach(([node, original]) => { for (const attr of Array.from(node.attributes)) node.removeAttribute(attr.name); for (const attr of original.attributes) node.setAttribute(attr.name, attr.value); }); };
  }, [article]);
  return <><Navbar /><main className="articles-shell article-reader"><Link className="articles-back" to="/new">← Tất cả bài viết</Link>
    {error ? <p role="alert" className="articles-empty">{error}</p> : !article ? <p role="status" className="articles-empty">Đang tải bài viết...</p> : <article>
      <div className="articles-badges"><span>{article.category}</span>{article.status === 'draft' && <span>Bản nháp · Chỉ admin xem được</span>}</div><h1>{article.title}</h1><p className="article-byline">{article.author?.name} · {articleDate(article.publishedAt || article.createdAt)} {isAdmin && <Link to={`/new/${article.slug}/edit`}>Chỉnh sửa bài viết</Link>}</p>
      {article.excerpt && <p className="article-lead">{article.excerpt}</p>}<ArticleContent content={article.content} />
    </article>}
  </main></>;
}
