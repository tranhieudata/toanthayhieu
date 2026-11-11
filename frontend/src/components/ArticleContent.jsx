import { useMemo } from 'react';
import katex from 'katex';
import renderMathInElement from 'katex/contrib/auto-render';
import 'katex/dist/katex.min.css';
import 'quill/dist/quill.snow.css';

const tags = new Set('p br h1 h2 h3 h4 h5 h6 strong b em i u s sub sup blockquote pre code ol ul li a img span div'.split(' '));

// Keep rich text formatting while removing executable HTML before public rendering.
export function renderArticleContent(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  doc.body.querySelectorAll('script,style,iframe,object,embed,svg,math,form,template').forEach(node => node.remove());
  for (const node of Array.from(doc.body.querySelectorAll('*'))) {
    if (!tags.has(node.localName)) { node.replaceWith(...node.childNodes); continue; }
    for (const attr of Array.from(node.attributes)) {
      const { name, value } = attr;
      const allowed = ['href', 'src', 'alt', 'width', 'height', 'class', 'data-value', 'data-list', 'style'].includes(name);
      if (!allowed || (['href', 'src'].includes(name) && !/^(https?:\/\/|\/(?!\/)|#)/i.test(value.trim()))) node.removeAttribute(name);
      if (name === 'class') node.className = value.split(/\s+/).filter(c => /^ql-(?:align-(?:center|right|justify)|indent-[1-8]|formula|syntax|code-block(?:-container)?)$/.test(c)).join(' ');
      if (name === 'style') {
        const color = node.style.color, background = node.style.backgroundColor;
        node.removeAttribute('style');
        if (color) node.style.color = color;
        if (background) node.style.backgroundColor = background;
      }
    }
    if (node.localName === 'a') node.setAttribute('rel', 'noopener noreferrer');
  }
  doc.body.querySelectorAll('.ql-formula').forEach(node => {
    node.innerHTML = katex.renderToString(node.getAttribute('data-value') || '', { throwOnError: false, trust: false });
  });
  renderMathInElement(doc.body, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false, trust: false, ignoredClasses: ['ql-formula'] });
  return doc.body.innerHTML;
}

export default function ArticleContent({ content }) {
  const html = useMemo(() => renderArticleContent(content), [content]);
  return <div className="article-content ql-editor lesson-content" dangerouslySetInnerHTML={{ __html: html }} />;
}
