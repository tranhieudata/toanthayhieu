import { useEffect, useRef } from 'react';
import Quill from 'quill';
import katex from 'katex';
import 'quill/dist/quill.snow.css';
import 'katex/dist/katex.min.css';

// Quill formula module requires window.katex
if (typeof window !== 'undefined') window.katex = katex;

// Register alignment module
const Align = Quill.import('formats/align');
Align.whitelist = ['', 'center', 'right', 'justify'];
Quill.register(Align, true);

export default function RichTextEditor({ value, onChange, placeholder = 'Nhập nội dung...' }) {
  const containerRef = useRef(null);
  const quillRef = useRef(null);
  const onChangeRef = useRef(onChange);

  // Luôn giữ onChangeRef trỏ đến hàm onChange mới nhất (tránh stale closure)
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!containerRef.current) return;

    // Xóa nội dung cũ (quan trọng để React Strict Mode hoạt động đúng)
    containerRef.current.innerHTML = '';

    quillRef.current = new Quill(containerRef.current, {
      theme: 'snow',
      placeholder,
      modules: {
        toolbar: {
          container: [
            [{ header: [1, 2, 3, 4, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ align: '' }, { align: 'center' }, { align: 'right' }, { align: 'justify' }],
            ['blockquote', 'code-block'],
            [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }],
            [{ script: 'sub' }, { script: 'super' }],
            [{ color: [] }, { background: [] }],
            ['link', 'image', 'video'],
            ['formula'],
            ['clean'],
          ],
        },
      },
    });

    // Set initial content
    if (value) {
      quillRef.current.root.innerHTML = value;
    }

    // Handle text changes - dùng onChangeRef để tránh stale closure
    const handleChange = () => {
      const html = quillRef.current.root.innerHTML;
      onChangeRef.current(html);
    };

    quillRef.current.on('text-change', handleChange);

    return () => {
      if (quillRef.current) {
        quillRef.current.off('text-change', handleChange);
        // Reset ref để React Strict Mode có thể khởi tạo lại đúng cách
        quillRef.current = null;
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync khi giá trị bên ngoài thay đổi (ví dụ: load dữ liệu bài học khi edit)
  useEffect(() => {
    if (
      quillRef.current &&
      value !== undefined &&
      value !== quillRef.current.root.innerHTML
    ) {
      quillRef.current.root.innerHTML = value || '';
    }
  }, [value]);

  return (
    <div>
      <div ref={containerRef} className="bg-white rounded-lg border border-gray-300" />
      <p className="text-xs text-gray-400 mt-2">
        <strong>Công thức toán:</strong> Dùng <code className="bg-gray-100 px-1 rounded">{'$x^2 + y^2$'}</code> cho công thức nội tuyến,{' '}
        <code className="bg-gray-100 px-1 rounded">{'$$\\sum_{i=1}^n x_i$$'}</code> cho công thức khối.
        Hoặc nhấn nút <strong>ƒx</strong> trên thanh công cụ.
      </p>
      <style>{`
        .ql-toolbar {
          border: 1px solid #d1d5db;
          border-bottom: none;
          border-radius: 0.5rem 0.5rem 0 0;
          background: #f9fafb;
          padding: 8px;
        }
        .ql-container {
          border: 1px solid #d1d5db;
          border-top: none;
          border-radius: 0 0 0.5rem 0.5rem;
          font-size: 16px;
          font-family: inherit;
        }
        .ql-toolbar.ql-snow .ql-picker-label {
          color: #666;
        }
        .ql-toolbar.ql-snow button,
        .ql-toolbar.ql-snow button.ql-active,
        .ql-toolbar.ql-snow .ql-picker-label {
          color: #495057;
        }
        .ql-toolbar.ql-snow button:hover,
        .ql-toolbar.ql-snow button.ql-active {
          color: #2563eb;
        }
        .ql-toolbar.ql-snow .ql-stroke {
          stroke: #495057;
        }
        .ql-toolbar.ql-snow button.ql-active .ql-stroke {
          stroke: #2563eb;
        }
        .ql-snow .ql-picker-options {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 0.375rem;
        }
        .ql-editor {
          min-height: 300px;
          padding: 12px;
          font-size: 16px;
        }
        .ql-editor.ql-blank::before {
          color: #9ca3af;
          font-style: normal;
        }
        .ql-editor p {
          margin-bottom: 0.5rem;
          line-height: 1.6;
        }
        .ql-editor h1,
        .ql-editor h2,
        .ql-editor h3,
        .ql-editor h4 {
          margin: 1rem 0 0.5rem 0;
          font-weight: 600;
          line-height: 1.4;
        }
        .ql-editor h1 { font-size: 2rem; }
        .ql-editor h2 { font-size: 1.5rem; }
        .ql-editor h3 { font-size: 1.25rem; }
        .ql-editor h4 { font-size: 1.1rem; }
        .ql-editor ol,
        .ql-editor ul {
          margin-bottom: 0.5rem;
          margin-left: 1.5rem;
        }
        .ql-editor li {
          margin-bottom: 0.25rem;
        }
        .ql-editor blockquote {
          border-left: 4px solid #2563eb;
          padding-left: 1rem;
          margin: 0.5rem 0;
          color: #666;
        }
        .ql-editor pre {
          background: #f3f4f6;
          padding: 0.75rem;
          border-radius: 0.375rem;
          margin: 0.5rem 0;
          color: #111;
        }
        .ql-editor code {
          background: #f3f4f6;
          padding: 0.2rem 0.4rem;
          border-radius: 0.25rem;
          font-family: 'Courier New', monospace;
          font-size: 0.9em;
        }
        .ql-editor img,
        .ql-editor video {
          max-width: 100%;
          height: auto;
          margin: 0.5rem 0;
          border-radius: 0.375rem;
        }
        .ql-editor a {
          color: #2563eb;
          text-decoration: underline;
        }
        .ql-editor a:hover {
          color: #1d4ed8;
        }
        .ql-editor sup,
        .ql-editor sub {
          font-size: 0.85em;
        }
      `}</style>
    </div>
  );
}
