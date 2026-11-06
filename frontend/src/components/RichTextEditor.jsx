import { useEffect, useRef, useState } from 'react';
import Quill from 'quill';
import katex from 'katex';
import api, { getUploadUrl } from '../api/axios';
import { IMAGE_TYPES, insertUploadedImages } from '../utils/editorImages';
import 'quill/dist/quill.snow.css';
import 'katex/dist/katex.min.css';

// Quill formula module requires window.katex
if (typeof window !== 'undefined') window.katex = katex;

// Register alignment module
const Align = Quill.import('formats/align');
Align.whitelist = ['', 'center', 'right', 'justify'];
Quill.register(Align, true);

export default function RichTextEditor({ value, onChange, onUploadingChange, placeholder = 'Nhập nội dung...' }) {
  const containerRef = useRef(null);
  const quillRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const selectedImageRef = useRef(null);
  const documentVersionRef = useRef(0);
  const [image, setImage] = useState(null);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    onUploadingChange?.(uploading > 0);
  }, [uploading, onUploadingChange]);

  useEffect(() => () => onUploadingChange?.(false), [onUploadingChange]);

  const selectImage = node => {
    selectedImageRef.current = node;
    if (!node) return setImage(null);
    const quill = quillRef.current;
    const index = quill.getIndex(Quill.find(node));
    setImage({
      width: node.getAttribute('width') || '',
      displayWidth: Math.round(node.getBoundingClientRect().width),
      alt: node.getAttribute('alt') || '',
      align: quill.getFormat(index, 1).align || '',
    });
  };

  const withImage = action => {
    const quill = quillRef.current;
    const node = selectedImageRef.current;
    if (!quill || !node || !quill.root.contains(node)) return;
    action(quill, quill.getIndex(Quill.find(node)), node);
    selectImage(quill.root.contains(node) ? node : null);
  };

  const resizeImage = width => withImage((quill, index) => {
    quill.formatText(index, 1, { width, height: false }, 'user');
  });

  const addTextLine = before => {
    withImage((quill, index) => {
      const [line, offset] = quill.getLine(index);
      const at = before ? index - offset : index - offset + line.length() - 1;
      quill.insertText(at, '\n', 'user');
      quill.setSelection(before ? at : at + 1, 0, 'user');
    });
    selectImage(null);
  };

  // Luôn giữ onChangeRef trỏ đến hàm onChange mới nhất (tránh stale closure)
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!containerRef.current) return;

    // Xóa nội dung cũ (quan trọng để React Strict Mode hoạt động đúng)
    containerRef.current.innerHTML = '';

    let quill;
    const uploadImages = async (range, files) => {
      const version = documentVersionRef.current;
      const isActive = () => quillRef.current === quill && documentVersionRef.current === version;
      setUploading(count => count + 1);
      setUploadError('');
      try {
        await insertUploadedImages(quill, range, files, async file => {
          const formData = new FormData();
          formData.append('file', file);
          const { data } = await api.post('/upload/image', formData);
          return getUploadUrl(data.url);
        }, isActive);
      } catch (error) {
        if (isActive()) setUploadError(error.response?.data?.message || error.message || 'Không tải được ảnh. Vui lòng thử lại.');
      } finally {
        if (quillRef.current === quill) setUploading(count => Math.max(0, count - 1));
      }
    };

    quill = new Quill(containerRef.current, {
      theme: 'snow',
      placeholder,
      modules: {
        history: { userOnly: true },
        uploader: { mimetypes: IMAGE_TYPES, handler: uploadImages },
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
          handlers: {
            image: () => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = IMAGE_TYPES.join(',');
              input.multiple = true;
              const range = quill.getSelection(true) || { index: quill.getLength() - 1, length: 0 };
              input.onchange = () => {
                const files = Array.from(input.files || []);
                if (files.length) uploadImages(range, files);
              };
              input.click();
            },
          },
        },
      },
    });
    quillRef.current = quill;

    // Set initial content
    if (value) {
      quillRef.current.root.innerHTML = value;
      quill.update('silent');
      quill.history.clear();
    }

    // Handle text changes - dùng onChangeRef để tránh stale closure
    const handleChange = () => {
      if (selectedImageRef.current) {
        selectImage(quill.root.contains(selectedImageRef.current) ? selectedImageRef.current : null);
      }
      const html = quillRef.current.root.innerHTML;
      onChangeRef.current(html);
    };

    quillRef.current.on('text-change', handleChange);

    const handleImageClick = event => {
      const node = event.target instanceof HTMLImageElement ? event.target : null;
      if (node) quill.setSelection(quill.getIndex(Quill.find(node)), 1, 'silent');
      selectImage(node);
    };
    const handleSelection = range => {
      if (!range) return;
      const [leaf] = quill.getLeaf(range.index);
      selectImage(leaf?.domNode instanceof HTMLImageElement ? leaf.domNode : null);
    };
    quill.root.addEventListener('click', handleImageClick);
    quill.on('selection-change', handleSelection);

    return () => {
      quill.off('text-change', handleChange);
      quill.off('selection-change', handleSelection);
      quill.root.removeEventListener('click', handleImageClick);
      selectedImageRef.current = null;
      quill.getModule('toolbar').container.remove();
      quillRef.current = null;
      containerRef.current?.replaceChildren();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync khi giá trị bên ngoài thay đổi (ví dụ: load dữ liệu bài học khi edit)
  useEffect(() => {
    if (
      quillRef.current &&
      value !== undefined &&
      value !== quillRef.current.root.innerHTML
    ) {
      documentVersionRef.current += 1;
      selectImage(null);
      quillRef.current.root.innerHTML = value || '';
      quillRef.current.update('silent');
      quillRef.current.history.clear();
    }
  }, [value]);

  return (
    <div className="rich-text-editor">
      <div className="editor-image-help">
        <span>Ảnh: bấm nút hình ảnh, dán bằng Ctrl+V hoặc kéo thả. Bấm vào ảnh để chỉnh kích thước và căn lề. Dùng Ctrl+X / Ctrl+V để chuyển ảnh đến vị trí con trỏ.</span>
        {uploading > 0 && <span role="status">Đang tải ảnh… Vui lòng chờ ảnh hiện trước khi lưu bài.</span>}
        {uploadError && <span role="alert" className="text-red-600">{uploadError}</span>}
      </div>
      {image && (
        <div className="editor-image-controls" role="group" aria-label="Chỉnh ảnh đã chọn" onMouseDown={event => {
          if (event.target.closest('button')) event.preventDefault();
        }}>
          <strong>Ảnh đã chọn</strong>
          <label>Chiều rộng (px)
            <input type="number" min="32" max="2400" value={image.widthInput ?? (image.width.endsWith('%') ? image.displayWidth : image.width || image.displayWidth)}
              onChange={event => {
                setImage(current => ({ ...current, widthInput: event.target.value }));
              }}
              onBlur={event => {
                const width = Number(event.target.value);
                if (width >= 32 && width <= 2400) resizeImage(String(width));
                else selectImage(selectedImageRef.current);
              }}
              onKeyDown={event => {
                if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
              }} />
          </label>
          <label>Kích thước
            <input type="range" aria-label="Kéo để đổi chiều rộng ảnh" min="32" max="1200"
              value={Math.min(1200, image.displayWidth || 32)} onChange={event => resizeImage(event.target.value)} />
          </label>
          {[25, 50, 75, 100].map(size => <button type="button" key={size} onClick={() => resizeImage(`${size}%`)}>{size}%</button>)}
          <button type="button" onClick={() => resizeImage(false)}>Cỡ gốc</button>
          {[['', 'Trái'], ['center', 'Giữa'], ['right', 'Phải']].map(([align, label]) => (
            <button type="button" key={label} aria-pressed={image.align === align}
              onClick={() => withImage((quill, index) => quill.formatLine(index, 1, 'align', align || false, 'user'))}>{label}</button>
          ))}
          <label>Mô tả ảnh
            <input type="text" value={image.alt} placeholder="Mô tả nội dung hình"
              onChange={event => withImage((quill, index) => quill.formatText(index, 1, 'alt', event.target.value, 'user'))} />
          </label>
          <button type="button" onClick={() => addTextLine(true)}>Viết phía trên</button>
          <button type="button" onClick={() => addTextLine(false)}>Viết phía dưới</button>
          <button type="button" onClick={() => withImage((quill, index) => quill.deleteText(index, 1, 'user'))}>Xóa ảnh</button>
          <button type="button" onClick={() => selectImage(null)}>Đóng</button>
        </div>
      )}
      <div ref={containerRef} className="bg-white rounded-lg border border-gray-300" />
      <p className="text-xs text-gray-400 mt-2">
        <strong>Công thức toán:</strong> Dùng <code className="bg-gray-100 px-1 rounded">{'$x^2 + y^2$'}</code> cho công thức nội tuyến,{' '}
        <code className="bg-gray-100 px-1 rounded">{'$$\\sum_{i=1}^n x_i$$'}</code> cho công thức khối.
        Hoặc nhấn nút <strong>ƒx</strong> trên thanh công cụ.
      </p>
      <style>{`
        .rich-text-editor .editor-image-help {
          display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; font-size: 13px; color: #64748b;
        }
        .rich-text-editor .editor-image-controls {
          display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
          padding: 12px; margin-bottom: 10px; border: 1px solid #93c5fd;
          border-radius: 8px; background: #eff6ff; font-size: 13px;
        }
        .rich-text-editor .editor-image-controls label { display: flex; align-items: center; gap: 6px; }
        .rich-text-editor .editor-image-controls input { min-width: 0; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px; }
        .rich-text-editor .editor-image-controls input[type=number] { width: 76px; }
        .rich-text-editor .editor-image-controls input[type=text] { width: 180px; }
        .rich-text-editor .editor-image-controls button { border: 1px solid #cbd5e1; border-radius: 4px; background: white; padding: 4px 8px; }
        .rich-text-editor .editor-image-controls button:hover,
        .rich-text-editor .editor-image-controls button[aria-pressed=true] { background: #dbeafe; border-color: #2563eb; }
        .rich-text-editor .ql-editor img { cursor: pointer; }
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
