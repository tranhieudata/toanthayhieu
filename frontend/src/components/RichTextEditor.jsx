import { useEffect, useRef, useState } from 'react';
import Quill from 'quill';
import katex from 'katex';
import 'quill/dist/quill.snow.css';
import 'katex/dist/katex.min.css';

// Quill formula module requires window.katex
if (typeof window !== 'undefined') window.katex = katex;

export default function RichTextEditor({ value, onChange, placeholder = 'Nhập nội dung...' }) {
  const editorRef = useRef(null);
  const quillRef = useRef(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (editorRef.current && !initialized) {
      quillRef.current = new Quill(editorRef.current, {
        theme: 'snow',
        placeholder,
        modules: {
          toolbar: [
            [{ header: [1, 2, 3, 4, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            ['blockquote', 'code-block'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            [{ color: [] }, { background: [] }],
            ['link', 'image'],
            ['formula'],
            ['clean'],
          ],
        },
      });

      // Paste HTML content on init
      if (value) {
        quillRef.current.root.innerHTML = value;
      }

      // Handle change
      quillRef.current.on('text-change', () => {
        const html = quillRef.current.root.innerHTML;
        onChange(html);
      });

      setInitialized(true);
    }
  }, [initialized, placeholder]);

  // Update external value
  useEffect(() => {
    if (quillRef.current && initialized && value !== quillRef.current.root.innerHTML) {
      quillRef.current.root.innerHTML = value;
    }
  }, [value, initialized]);

  return (
    <div>
      <div ref={editorRef} className="bg-white rounded-lg border border-gray-300 min-h-64" />
      <p className="text-xs text-gray-400 mt-1">
        Công thức toán: dùng <code className="bg-gray-100 px-1 rounded">{'$x^2 + y^2$'}</code> cho công thức nội tuyến,{' '}
        <code className="bg-gray-100 px-1 rounded">{'$$\\sum_{i=1}^n x_i$$'}</code> cho công thức khối.
        Hoặc nhấn nút <strong>ƒx</strong> trên thanh công cụ.
      </p>
      <style>{`
        .ql-container {
          font-size: 16px;
          font-family: inherit;
        }
        .ql-toolbar {
          border-top: 1px solid #ccc;
          border-left: 1px solid #ccc;
          border-right: 1px solid #ccc;
        }
        .ql-container {
          border-left: 1px solid #ccc;
          border-right: 1px solid #ccc;
          border-bottom: 1px solid #ccc;
        }
        .ql-toolbar.ql-snow .ql-picker-label {
          color: #666;
        }
      `}</style>
    </div>
  );
}
