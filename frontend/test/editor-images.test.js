import { test } from 'node:test';
import assert from 'node:assert/strict';
import Delta from 'quill-delta';
import { insertUploadedImages } from '../src/utils/editorImages.js';

const image = { type: 'image/png', size: 100 };

function editor(text = 'hello world\n') {
  let contents = new Delta().insert(text);
  const listeners = new Set();
  const quill = {
    changes: [],
    history: { cutoff() {} },
    on(name, listener) { listeners.add(listener); },
    off(name, listener) { listeners.delete(listener); },
    getLength() { return contents.length(); },
    getLine(index) {
      const prefix = contents.slice(0, index).ops.map(op => typeof op.insert === 'string' ? op.insert : '\uFFFC').join('');
      return [null, prefix.length - prefix.lastIndexOf('\n') - 1];
    },
    updateContents(change, source) {
      contents = contents.compose(change);
      quill.changes.push({ change, source });
      for (const listener of listeners) listener(change);
    },
    setSelection(index) { quill.caret = index; },
    get contents() { return contents; },
    get listenerCount() { return listeners.size; },
  };
  return quill;
}

test('one uploaded image replaces the selection once, with its own paragraph', async () => {
  const quill = editor();
  let uploads = 0;
  await insertUploadedImages(quill, { index: 6, length: 5 }, [image], async () => {
    uploads++;
    return '/uploads/diagram.png';
  });
  assert.equal(uploads, 1);
  assert.equal(quill.changes.length, 1);
  assert.equal(quill.changes[0].source, 'user');
  assert.deepEqual(quill.contents.ops, [
    { insert: 'hello \n' }, { insert: { image: '/uploads/diagram.png' } }, { insert: '\n\n' },
  ]);
  assert.equal(quill.caret, 9);
  assert.equal(quill.listenerCount, 0);
});

test('multiple images retain file order and are separated by paragraphs', async () => {
  const quill = editor('\n');
  const files = [image, { ...image, type: 'image/webp' }];
  let count = 0;
  await insertUploadedImages(quill, { index: 0, length: 0 }, files, async () => `/uploads/${++count}`);
  assert.deepEqual(quill.contents.ops, [
    { insert: { image: '/uploads/1' } }, { insert: '\n' },
    { insert: { image: '/uploads/2' } }, { insert: '\n\n' },
  ]);
  assert.equal(quill.caret, 4);
});

test('typing before the insertion point while uploading shifts the insertion position', async () => {
  const quill = editor();
  await insertUploadedImages(quill, { index: 6, length: 0 }, [image], async () => {
    quill.updateContents(new Delta().insert('new '), 'user');
    return '/uploads/image';
  });
  assert.deepEqual(quill.contents.ops, [
    { insert: 'new hello \n' }, { insert: { image: '/uploads/image' } }, { insert: '\nworld\n' },
  ]);
  assert.equal(quill.caret, 13);
});

test('deleting text while uploading does not leave an out of bounds insertion', async () => {
  const quill = editor();
  await insertUploadedImages(quill, { index: 6, length: 5 }, [image], async () => {
    quill.updateContents(new Delta().delete(11), 'user');
    return '/uploads/image';
  });
  assert.deepEqual(quill.contents.ops, [{ insert: { image: '/uploads/image' } }, { insert: '\n\n' }]);
  assert.equal(quill.caret, 2);
});

test('upload failure preserves selected text and cleans up the change listener', async () => {
  const quill = editor();
  await assert.rejects(insertUploadedImages(quill, { index: 0, length: 5 }, [image], async () => {
    throw new Error('Upload failed');
  }), /Upload failed/);
  assert.deepEqual(quill.contents.ops, [{ insert: 'hello world\n' }]);
  assert.equal(quill.listenerCount, 0);
});

test('completion after unmount or loading another lesson does not alter the document', async () => {
  const quill = editor();
  await insertUploadedImages(quill, { index: 0, length: 0 }, [image], async () => '/uploads/image', () => false);
  assert.equal(quill.changes.length, 0);
  assert.equal(quill.listenerCount, 0);
});

test('unsupported files and oversized images fail before making network requests', async () => {
  for (const file of [{ type: 'image/svg+xml', size: 100 }, { ...image, size: 6 * 1024 * 1024 }]) {
    const quill = editor();
    let uploads = 0;
    await assert.rejects(insertUploadedImages(quill, { index: 0, length: 0 }, [file], async () => { uploads++; }));
    assert.equal(uploads, 0);
    assert.equal(quill.changes.length, 0);
    assert.equal(quill.listenerCount, 0);
  }
});
