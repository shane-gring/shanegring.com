// Handled intake — the template picker.
//
// CONTENT, NOT CODE. Add a seventh entry, drop the third, reorder them — the
// picker re-renders from this array and nothing needs a code change. Nothing
// anywhere assumes how many there are.
//
// Names and previews below are placeholders; Chris is producing the real ones.
// A preview image that doesn't exist yet falls back to a neutral placeholder
// rather than breaking the render, so you can drop PNGs in one at a time.
//
//   id            stable key stored on the record. Don't reuse or repoint an
//                 id once a client has chosen it.
//   name          shown under the preview.
//   description   one line. "TBD" renders as nothing rather than the word.
//   previewImage  path under /images/handled/templates/.

export const TEMPLATES = [
  { id: 'template-01', name: 'Placeholder A', description: 'TBD', previewImage: '/images/handled/templates/01.png' },
  { id: 'template-02', name: 'Placeholder B', description: 'TBD', previewImage: '/images/handled/templates/02.png' },
  { id: 'template-03', name: 'Placeholder C', description: 'TBD', previewImage: '/images/handled/templates/03.png' },
  { id: 'template-04', name: 'Placeholder D', description: 'TBD', previewImage: '/images/handled/templates/04.png' },
  { id: 'template-05', name: 'Placeholder E', description: 'TBD', previewImage: '/images/handled/templates/05.png' },
];

// Shown when previewImage 404s or isn't there yet. Inline SVG so it needs no
// network request and can never itself be the broken image.
export const PLACEHOLDER_PREVIEW =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240">' +
      '<rect width="320" height="240" fill="#fafafa"/>' +
      '<rect x="0.5" y="0.5" width="319" height="239" fill="none" stroke="#e5e5e5"/>' +
      '<rect x="40" y="48" width="240" height="14" rx="3" fill="#e5e5e5"/>' +
      '<rect x="40" y="76" width="170" height="10" rx="3" fill="#ededed"/>' +
      '<rect x="40" y="112" width="240" height="70" rx="6" fill="#f2f2f2"/>' +
      '<rect x="40" y="196" width="96" height="12" rx="6" fill="#e5e5e5"/>' +
    '</svg>'
  );

export const templateById = (id) => TEMPLATES.find((t) => t.id === id) || null;

// "TBD" is a note to us, not copy for the client.
export const templateBlurb = (t) => (!t.description || t.description === 'TBD' ? '' : t.description);
