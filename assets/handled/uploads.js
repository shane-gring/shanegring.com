// Handled intake — what may be uploaded.
//
// CONTENT, NOT CODE. Both sides read this: the browser validates before asking
// for a presigned URL, and the Function validates again before issuing one.
// Client-side validation is a courtesy that fails fast; the server check is
// the one that actually matters, and it reads these same numbers.
//
// Audio, not video. Five minutes of AAC at 64 kbps mono is about 2.4 MB; the
// same five minutes of phone video is 200-400 MB. That difference removes a
// whole class of failure — no progress bar to watch, no mobile data burned, no
// upload dying in a van on a bad signal at the end of a five-minute recording,
// which was the worst abandonment case in this flow.
//
// 50 MB is far above anything the in-browser recorder produces. It is sized for
// someone uploading a voice memo their phone recorded at a much higher bitrate,
// which is the one case that legitimately gets large.

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
  audio: {
    label: 'Audio files',
    maxBytes: 50 * 1024 * 1024,
    // m4a and mp4 are the same container; iOS hands back audio/mp4 from
    // MediaRecorder and audio/x-m4a from the Files picker for the same file.
    extensions: ['m4a', 'mp4', 'mp3', 'wav', 'aac', 'webm', 'ogg', 'oga'],
    mimeTypes: [
      'audio/mp4', 'audio/x-m4a', 'audio/aac',
      'audio/mpeg', 'audio/mp3',
      'audio/wav', 'audio/x-wav', 'audio/wave',
      'audio/webm', 'audio/ogg',
    ],
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

  // The extension is the primary signal and the MIME type is the fallback, not
  // the other way round. Accepting "either matches" let a file named
  // payload.exe through on a declared type of image/png, since the client
  // controls both. HEIC — the case this leniency exists for — has a known
  // extension and an empty MIME, which this still allows.
  const ext = extensionOf(name);
  const typeOk = ext ? g.extensions.includes(ext) : Boolean(type) && g.mimeTypes.includes(type);
  if (!typeOk) {
    return `${g.label} need to be ${g.extensions.slice(0, -1).join(', ')} or ${g.extensions.slice(-1)}. ` +
           `That one is a .${ext || 'file'}.`;
  }

  if (!Number.isFinite(size) || size <= 0) return 'That file came through empty. Try picking it again.';
  if (size > g.maxBytes) {
    // The way out of this differs by kind, and "try a smaller one" is useless
    // advice on its own — say the thing that actually works.
    const remedy = {
      audio: 'A shorter recording will go through.',
      image: 'Most phones can export a smaller version.',
      document: 'A PDF export is usually much smaller.',
    }[groupName] || 'A smaller file will go through.';
    return `That file is ${formatBytes(size)} and the limit is ${formatBytes(g.maxBytes)}. ${remedy}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// In-browser recording.
// ---------------------------------------------------------------------------

// Ordered by how widely the container is understood, not by quality. audio/mp4
// is first because it is the only one iOS Safari has ever produced, and a file
// every browser and every transcription service can open matters more here than
// squeezing the bitrate. Chrome and Firefox accept it too, so in practice one
// format covers everyone and there is no per-browser branch.
export const RECORD_TYPES = [
  'audio/mp4',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
];

// Returns the first type this browser will actually record, or null if it
// cannot record at all — in which case the UI hides the option rather than
// showing a control that throws when pressed.
export function pickRecordType() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of RECORD_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch { /* isTypeSupported throws on some older builds */ }
  }
  return null;
}

export function canRecord() {
  return Boolean(
    typeof MediaRecorder !== 'undefined' &&
    navigator.mediaDevices?.getUserMedia &&
    window.isSecureContext &&
    pickRecordType()
  );
}

export const extensionForType = (type) => {
  const t = String(type || '').split(';')[0];
  return { 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'oga', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' }[t] || 'm4a';
};

// 64 kbps mono is transparent for speech and keeps five minutes near 2.4 MB.
export const RECORD_BITRATE = 64000;

// A hard stop so a recorder left running in a pocket cannot produce a file that
// costs real money to transcribe or fails to upload. The UI warns before it.
export const RECORD_MAX_SECONDS = 15 * 60;
