import katex from 'katex';
import 'katex/dist/katex.min.css';

export default function ReviewText({ children }) {
  return <span className="review-text">{String(children || '').split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g).map((part, index) => {
    if (!part.startsWith('$')) return part;
    const block = part.startsWith('$$');
    const tex = part.slice(block ? 2 : 1, block ? -2 : -1);
    return <span key={index} dangerouslySetInnerHTML={{ __html: katex.renderToString(tex, { displayMode: block, throwOnError: false, trust: false, strict: 'ignore' }) }} />;
  })}</span>;
}
