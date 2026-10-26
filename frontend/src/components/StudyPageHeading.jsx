import { FiArrowUpRight } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import '../styles/study-pages.css';

export function StudyPageHeading({ icon: Icon, eyebrow, title, description, stats = [] }) {
  return <header className="study-heading">
    <div className="study-heading-copy"><p className="study-eyebrow">{eyebrow}</p>
      <div className="study-heading-title"><span className="study-heading-icon"><Icon /></span><h1>{title}</h1></div>
      <p className="study-description">{description}</p>
      {stats.length > 0 && <dl className="study-stats">{stats.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    </div>
    <Link to="/community" className="study-community-link"><span className="study-community-heart">♡</span><span>Học một chút.<br /><b>Tiến bộ mỗi ngày.</b><small>Ghé góc nhỏ của chúng mình <FiArrowUpRight /></small></span></Link>
  </header>;
}

export function StudyEmptyState({ icon: Icon, title, description }) {
  return <section className="study-empty"><span className="study-empty-icon"><Icon /></span><h2>{title}</h2><p>{description}</p><span className="study-empty-dots" aria-hidden="true">· · ·</span></section>;
}
