// Handled intake — the template picker.
//
// CONTENT, NOT CODE. Add a seventh entry, drop the third, reorder them — the
// picker re-renders from this array and nothing needs a code change. Nothing
// anywhere assumes how many there are.
//
// These are real sites Shane has built, not mockups. A client picking from work
// that exists is picking something they can go and look at, which is why the
// description is the domain rather than a word like "bold" — they can open it in
// another tab and judge for themselves.
//
// The same screenshots appear on /handled, so the look a client chooses here is
// the look they were sold on the page they bought from.
//
// A preview image that doesn't exist falls back to a neutral placeholder rather
// than breaking the render, so entries can be swapped one at a time.
//
//   id            stable key stored on the record. Don't reuse or repoint an
//                 id once a client has chosen it.
//   name          shown under the preview.
//   description   one line. "TBD" renders as nothing rather than the word.
//   previewImage  path under /images/handled/.

export const TEMPLATES = [
  {
    id: 'look-buckhead',
    name: 'Buckhead Restaurant Week',
    description: 'buckheadrestaurantweek.com',
    previewImage: '/images/handled/1-buckhead-restaurant-week.png',
  },
  {
    id: 'look-drvn',
    name: 'DRVN Golf',
    description: 'drvngolf.com',
    previewImage: '/images/handled/7-drvn.png',
  },
  {
    id: 'look-forj',
    name: 'The Forj Group',
    description: 'theforjgroup.com',
    previewImage: '/images/handled/4-forj.png',
  },
  {
    id: 'look-bfs',
    name: 'Bigger Faster Stronger',
    description: 'biggerfasterstronger.com',
    previewImage: '/images/handled/5-bfs.png',
  },
  {
    id: 'look-excel',
    name: 'Excel Training Designs',
    description: 'exceltrainingdesigns.com',
    previewImage: '/images/handled/6-excel-training-designs.png',
  },
  {
    id: 'look-albizhubi',
    name: 'Albi Zhubi',
    description: 'albizhubi.com',
    previewImage: '/images/handled/1-albizhubi.png',
  },
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
