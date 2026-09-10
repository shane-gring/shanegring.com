// Handled intake — what may be uploaded.
//
// CONTENT, NOT CODE. Both sides read this: the browser validates before asking
// for a presigned URL, and the Function validates again before issuing one.
// Client-side validation is a courtesy that fails fast; the server check is
// the one that actually matters, and it reads these same numbers.
//
// The video ceiling is high on purpose. A five-minute clip from a recent phone
// at default settings lands between 200 MB and 400 MB, and a client who hits a
// limit at the end of a five-minute recording does not try again — they leave.

export const GROUPS = {
  image: {
    label: 'Images',
    maxBytes: 25 * 1024 * 1024,
    // heic has no settled MIME type across browsers; some report an empty
    // string. Extension is the reliable signal, so both are checked and either
    // may satisfy the type test.
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'svg', 'heic', 'heif'],
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/heic', 'image/heif'],
  },
  video: {
    label: 'Video',
    maxBytes: 500 * 1024 * 1024,
    extensions: ['mp4', 'mov', 'webm', 'm4v'],
    mimeTypes: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'],
  },
  document: {
    label: 'Documents',
    maxBytes: 25 * 1024 * 1024,
    extensions: ['pdf', 'docx', 'txt', 'md', 'rtf'],
    mimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
      'application/rtf',
    ],
  },
};

export const extensionOf = (filename) => {
  const m = /\.([a-z0-9]+)$/i.exec(String(filename || ''));
  return m ? m[1].toLowerCase() : '';
};

// The `accept` attribute for a file input, so the OS picker filters sensibly.
export const acceptAttr = (groupName) => {
  const g = GROUPS[groupName];
  if (!g) return '';
  return [...g.mimeTypes, ...g.extensions.map((e) => '.' + e)].join(',');
};

export const formatBytes = (n) => {
  if (!Number.isFinite(n)) return '';
  if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(1) + ' GB';
  if (n >= 1024 * 1024) return Math.round(n / 1024 / 1024) + ' MB';
  return Math.max(1, Math.round(n / 1024)) + ' KB';
};

// Returns null when acceptable, or a plain sentence naming what to do instead.
// The message is shown to the client verbatim, so it says what happened and
// what would work — never just "invalid file".
export function validateUpload(groupName, { name, size, type }) {
  const g = GROUPS[groupName];
  if (!g) return 'That kind of file can’t go here.';

  const ext = extensionOf(name);
  const typeOk = (type && g.mimeTypes.includes(type)) || (ext && g.extensions.includes(ext));
  if (!typeOk) {
    return `${g.label} need to be ${g.extensions.slice(0, -1).join(', ')} or ${g.extensions.slice(-1)}. ` +
           `That one is a .${ext || 'file'}.`;
  }

  if (!Number.isFinite(size) || size <= 0) return 'That file came through empty. Try picking it again.';
  if (size > g.maxBytes) {
    return `That file is ${formatBytes(size)} and the limit is ${formatBytes(g.maxBytes)}. ` +
           `A shorter clip or a smaller export will go through.`;
  }
  return null;
}
