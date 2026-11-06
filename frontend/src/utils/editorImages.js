import Delta from 'quill-delta';

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Follow edits made while the network request is in flight. Insert through Quill
// so image attributes and undo/redo remain part of the document model.
export async function insertUploadedImages(quill, range, files, upload, isActive = () => true) {
  let start = range.index;
  let end = start + range.length;
  const followEdits = delta => {
    start = delta.transformPosition(start);
    end = delta.transformPosition(end);
  };
  quill.on('text-change', followEdits);
  try {
    const urls = [];
    for (const file of files) {
      if (!IMAGE_TYPES.includes(file.type)) throw new Error('Chỉ chấp nhận ảnh JPG, PNG, GIF hoặc WebP.');
      if (file.size > 5 * 1024 * 1024) throw new Error('Mỗi ảnh cần nhỏ hơn hoặc bằng 5 MB.');
    }
    for (const file of files) {
      const url = await upload(file);
      if (!isActive()) return;
      urls.push(url);
    }
    if (!urls.length || !isActive()) return;
    start = Math.min(start, quill.getLength() - 1);
    end = Math.max(start, Math.min(end, quill.getLength() - 1));
    const [, offset] = quill.getLine(start);
    let change = new Delta().retain(start).delete(end - start);
    if (offset > 0) change = change.insert('\n');
    for (const url of urls) change = change.insert({ image: url }).insert('\n');
    const caret = change.length() - (end - start);
    quill.history.cutoff();
    quill.updateContents(change, 'user');
    quill.history.cutoff();
    quill.setSelection(caret, 0, 'silent');
  } finally {
    quill.off('text-change', followEdits);
  }
}
