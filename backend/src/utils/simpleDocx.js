const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = Math.max(date.getFullYear() - 1980, 0);
  return { time, date: (year << 9) | (month << 5) | day };
}

function zipStore(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const stamp = dosDateTime();

  files.forEach(({ name, content }) => {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);

    offset += local.length + nameBuffer.length + data.length;
  });

  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, central, end]);
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textRuns(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  return lines.map((line, idx) => `${idx ? '<w:br/>' : ''}<w:t xml:space="preserve">${xmlEscape(line)}</w:t>`).join('');
}

function paragraph(text = '', options = {}) {
  const align = options.align ? `<w:jc w:val="${options.align}"/>` : '';
  const bold = options.bold ? '<w:b/>' : '';
  const size = options.size ? `<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/>` : '';
  return `<w:p><w:pPr>${align}</w:pPr><w:r><w:rPr>${bold}${size}</w:rPr>${textRuns(text)}</w:r></w:p>`;
}

function cell(content, options = {}) {
  const width = options.width ? `<w:tcW w:w="${options.width}" w:type="dxa"/>` : '';
  const shade = options.shade ? `<w:shd w:fill="${options.shade}"/>` : '';
  const body = Array.isArray(content) ? content.join('') : paragraph(content, options);
  return `<w:tc><w:tcPr>${width}${shade}</w:tcPr>${body}</w:tc>`;
}

function table(rows) {
  const borders = '<w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders>';
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${borders}</w:tblPr>${rows.map(row => `<w:tr>${row.map(c => cell(c.content ?? c, c)).join('')}</w:tr>`).join('')}</w:tbl>`;
}

function formatCell(value) {
  if (!value) return '';
  if (typeof value === 'object') {
    const count = Number(value.count) || 0;
    const points = Number(value.points) || 0;
    return count > 0 ? `${count} (${points}đ)` : '';
  }
  return String(value);
}

function getLevelDefs(paper) {
  const source = Array.isArray(paper?.cognitiveLevels) && paper.cognitiveLevels.length > 0
    ? paper.cognitiveLevels
    : [
      { key: 'NB', name: 'Nhận biết' },
      { key: 'TH', name: 'Thông hiểu' },
      { key: 'VD', name: 'Vận dụng' },
      { key: 'VDC', name: 'Vận dụng cao' },
    ];
  return source.map((level, index) => ({
    key: String(level.key || level.name || `L${index + 1}`),
    name: String(level.name || level.key || `Mức ${index + 1}`),
  }));
}

function headerBlock(paper, title) {
  const meta = paper.meta || {};
  return [
    table([
      [
        { content: `UBND ${meta.department || '.........'}\n${meta.schoolName || 'TRƯỜNG ................'}`, bold: true, align: 'center' },
        { content: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc', bold: true, align: 'center' },
      ],
    ]),
    paragraph(title, { bold: true, align: 'center', size: 28 }),
    paragraph(`${meta.examName || 'KIỂM TRA'} - NĂM HỌC: ${meta.schoolYear || ''}`, { bold: true, align: 'center' }),
    paragraph(`Môn: Toán - Lớp: ${meta.grade || ''}${meta.duration ? ` - Thời gian: ${meta.duration} phút` : ''}`, { align: 'center' }),
  ].join('');
}

function matrixTable(paper) {
  const levels = getLevelDefs(paper);
  const rows = [
    ['TT', 'Chủ đề', 'Nội dung / Đơn vị kiến thức', ...levels.map(level => `TN ${level.name}`), ...levels.map(level => `TL ${level.name}`), 'Tổng câu', 'Tổng điểm', 'Tỉ lệ %']
      .map(content => ({ content, bold: true, align: 'center', shade: 'D9EAF7' })),
  ];
  (paper.matrix || []).forEach((row, idx) => {
    rows.push([
      String(idx + 1),
      row.topic,
      row.unit,
      ...levels.map(level => formatCell(row.tn?.[level.key])),
      ...levels.map(level => formatCell(row.tl?.[level.key])),
      String(row.totalQuestions || 0),
      `${row.totalPoints || 0}đ`,
      `${row.ratio || 0}%`,
    ]);
  });
  if (paper.totals) {
    const t = paper.totals;
    rows.push([
      { content: 'Tổng', bold: true },
      '',
      '',
      ...levels.map(level => formatCell(t.tn?.[level.key])),
      ...levels.map(level => formatCell(t.tl?.[level.key])),
      String(t.totalQuestions || 0),
      `${t.totalPoints || 0}đ`,
      '100%',
    ]);
  }
  return table(rows);
}

function specTable(paper) {
  const levels = getLevelDefs(paper);
  const rows = [
    ['TT', 'Chủ đề', 'Nội dung', 'Yêu cầu cần đạt', ...levels.map(level => `TN ${level.name}`), ...levels.map(level => `TL ${level.name}`)]
      .map(content => ({ content, bold: true, align: 'center', shade: 'E2F0D9' })),
  ];
  (paper.specification || []).forEach((row, idx) => {
    rows.push([
      String(idx + 1),
      row.topic,
      row.unit,
      row.requirement,
      ...levels.map(level => formatCell(row.tn?.[level.key]?.count ?? row.tn?.[level.key])),
      ...levels.map(level => formatCell(row.tl?.[level.key]?.count ?? row.tl?.[level.key])),
    ]);
  });
  return table(rows);
}

function officialExam(paper) {
  const mc = paper.questions?.multipleChoice || [];
  const essay = paper.questions?.essay || [];
  return [
    headerBlock(paper, 'ĐỀ CHÍNH THỨC'),
    paragraph(`I - PHẦN TRẮC NGHIỆM: (${paper.meta?.mcPoints || 0} điểm)`, { bold: true }),
    paragraph('Chọn đáp án đúng nhất trong các câu sau và ghi vào bài làm.'),
    ...mc.flatMap(q => [
      paragraph(`Câu ${q.number}. ${q.question}`),
      paragraph(`A. ${q.options?.A || ''}`),
      paragraph(`B. ${q.options?.B || ''}`),
      paragraph(`C. ${q.options?.C || ''}`),
      paragraph(`D. ${q.options?.D || ''}`),
    ]),
    paragraph(`II - PHẦN TỰ LUẬN: (${paper.meta?.essayPoints || 0} điểm)`, { bold: true }),
    ...essay.map((q, idx) => paragraph(`Bài ${idx + 1}. (${q.points} điểm) ${q.question}`)),
  ].join('');
}

function answerKey(paper) {
  const mc = paper.questions?.multipleChoice || [];
  const essay = paper.questions?.essay || [];
  return [
    headerBlock(paper, 'HƯỚNG DẪN CHẤM ĐỀ KIỂM TRA'),
    paragraph('I. Phần trắc nghiệm:', { bold: true }),
    table([
      [{ content: 'Câu', bold: true }, ...mc.map(q => String(q.number))],
      [{ content: 'Đáp án', bold: true }, ...mc.map(q => q.answer || '')],
    ]),
    paragraph('II. Phần tự luận:', { bold: true }),
    ...essay.map((q, idx) => paragraph(`Bài ${idx + 1}. (${q.points} điểm)\n${q.solution || ''}`)),
    paragraph('..........., ngày       tháng       năm 20....', { align: 'right' }),
    paragraph('GIÁO VIÊN RA ĐỀ', { bold: true, align: 'right' }),
  ].join('');
}

function documentXml(paper) {
  const body = [
    headerBlock(paper, 'MA TRẬN ĐỀ KIỂM TRA'),
    matrixTable(paper),
    paragraph('BẢN ĐẶC TẢ ĐỀ KIỂM TRA', { bold: true, align: 'center', size: 28 }),
    specTable(paper),
    officialExam(paper),
    answerKey(paper),
  ].join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body>
</w:document>`;
}

function createDocxBuffer(paper) {
  const files = [
    {
      name: '[Content_Types].xml',
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    },
    {
      name: '_rels/.rels',
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    },
    { name: 'word/document.xml', content: documentXml(paper) },
  ];
  return zipStore(files);
}

module.exports = { createDocxBuffer };
