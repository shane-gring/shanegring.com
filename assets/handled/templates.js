// Handled intake — the template picker.
//
// CONTENT, NOT CODE. Add a fifth entry, drop the third, reorder them — the
// picker re-renders from this array and nothing needs a code change. Nothing
// anywhere assumes how many there are.
//
// Each entry maps to a real page in /handled-templates/. The preview images
// are screenshots OF those pages, so a client choosing "The Field" is looking
// at the thing they will actually get rather than an illustration of it. If
// you change a template, re-shoot its preview — see HANDLED-TEMPLATES.md.
//
//   id            stable key stored on the record. Don't reuse or repoint an
//                 id once a client has chosen it.
//   name          shown under the preview.
//   description   one line, written for the CLIENT, not for a designer. It
//                 should help someone recognise their own business, not
//                 describe a visual style.
//   previewImage  screenshot of the live template.
//   viewUrl       the live page, opened in a new tab from the card.

export const TEMPLATES = [
  {
    id: 'template-standard',
    name: 'The Standard',
    description: 'For work that someone else verifies — certification, inspection, accreditation.',
    previewImage: '/images/handled/templates/standard.jpg',
    viewUrl: '/handled-templates/standard',
  },
  {
    id: 'template-practice',
    name: 'The Practice',
    description: 'For one person whose work is judgement. Quiet, personal, no sales noise.',
    previewImage: '/images/handled/templates/practice.jpg',
    viewUrl: '/handled-templates/practice',
  },
  {
    id: 'template-signal',
    name: 'The Signal',
    description: 'For an idea the market hasn’t caught up with yet. Built to land one argument.',
    previewImage: '/images/handled/templates/signal.jpg',
    viewUrl: '/handled-templates/signal',
  },
  {
    id: 'template-marquee',
    name: 'The Marquee',
    description: 'For a place or a product people come to see. Shops, studios, venues, makers.',
    previewImage: '/images/handled/templates/marquee.jpg',
    viewUrl: '/handled-templates/marquee',
  },
  {
    id: 'template-rooms',
    name: 'The Rooms',
    description: 'For a business people come to by appointment, with more than one person on the team. Studios, salons, clinics, workshops.',
    previewImage: '/images/handled/templates/rooms.jpg',
    viewUrl: '/handled-templates/rooms',
  },
  {
    id: 'template-column',
    name: 'The Column',
    description: 'For work that takes a paragraph to explain. One big photograph and room to set out how you do it.',
    previewImage: '/images/handled/templates/column.jpg',
    viewUrl: '/handled-templates/column',
  },
  {
    id: 'template-drift',
    name: 'The Drift',
    description: 'For work with nothing to photograph. Remote services, advisers, tutors, agencies.',
    previewImage: '/images/handled/templates/drift.jpg',
    viewUrl: '/handled-templates/drift',
  },
  {
    id: 'template-field',
    name: 'The Field',
    description: 'For physical work you can photograph — trades, contractors, installers. Phone first.',
    previewImage: '/images/handled/templates/field.jpg',
    viewUrl: '/handled-templates/field',
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
