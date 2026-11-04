function plainSummaryText(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>|<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1: $2')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hasMathSyntax(value) {
  // Preserve homework URLs verbatim, even when their query contains = or $.
  const text = String(value || '').replace(/https?:\/\/\S+/g, '');
  return /\$|\\(?:[()[\]]|[a-zA-Z]+)|[=<>≤≥≠±×÷√∑∫∞²³^]|\b[a-zA-Z]\s*_[\w{]|\b[a-zA-Z]\b\s*[+*/-]\s*\b[a-zA-Z0-9]\b|\d\s*[+*/-]\s*\d/.test(text);
}

function plainTopic(value, fallback = 'bài học hôm nay') {
  const title = plainSummaryText(value)
    .replace(/\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\$[^$]*\$/g, '')
    .replace(/\s+/g, ' ').trim();
  return title && !hasMathSyntax(title) ? title : fallback;
}

module.exports = { plainSummaryText, hasMathSyntax, plainTopic };
