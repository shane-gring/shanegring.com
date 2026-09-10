// Handled intake — the questions.
//
// THIS FILE IS CONTENT, NOT CODE. Chris and Shane edit it directly; nothing in
// the app hard-codes a question, a section, an order, or a count. Add a
// question, reword one, move one between sections, drop one — the intake
// re-renders from whatever is here, and the review screen and the email
// summary follow automatically.
//
// It is imported by BOTH sides: the browser (assets/handled/app.js) renders
// from it, and the Pages Function (functions/api/handled/*) validates and
// builds Shane's email summary from it. One source of truth, so a reworded
// question can never drift between the form and the email.
//
// Field shape:
//   id        stable key the answer is stored under. NEVER change an existing
//             id — that orphans answers already saved in live drafts. Reword
//             `label` freely; leave `id` alone.
//   type      text | email | tel | textarea | template-picker
//             | repeatable-text | file | files | text-or-file
//   label     the question, shown to the client, verbatim.
//   help      optional line under the label.
//   required  defaults to false. Keep this rare — see the note below.
//   notSure   adds a "Not sure" toggle beside the input (Section 3 uses it).
//   accept    for file types: which upload group in uploads.js applies.
//
// On `required`: someone has paid $300 before they ever see this form, so the
// risk we are designing against is abandonment, not incomplete data. Only the
// four fields below are required, and that is deliberate. Everything else can
// be skipped and come back to. Do not add `required: true` casually.

export const SECTIONS = [
  {
    id: 'basics',
    screen: 'The basics',
    title: 'The basics',
    intro: '',
    questions: [
      { id: 'business_name', type: 'text',     label: 'Business name.', required: true, autocomplete: 'organization' },
      { id: 'one_liner',     type: 'text',     label: 'In one line, what do you do?', required: true },
      { id: 'domain',        type: 'text',     label: 'Do you already own a domain name? If so, what is it?' },
      { id: 'email',         type: 'email',    label: 'Best email.', required: true, autocomplete: 'email' },
      { id: 'phone',         type: 'tel',      label: 'Best phone number.', autocomplete: 'tel' },
    ],
  },

  {
    id: 'business',
    screen: 'Your business',
    title: 'Tell us about the business',
    intro:
      'Easiest way to do this is to talk. Hit record and work through the ' +
      'prompts below — about five minutes total, no script needed. It’s ' +
      'audio only, so there’s no camera. Prefer to write? Type your answers ' +
      'instead, that works just as well.',
    // Rendered as on-screen prompts while recording, AND as one textarea each
    // in the typed path. Same ids either way, so switching paths mid-answer
    // never loses what is already written.
    //
    // Audio rather than video: it is the one thing iOS Safari reliably records,
    // a five-minute file is ~2.4 MB instead of ~300 MB, and asking someone to
    // talk for five minutes is a phone call while asking them to be on camera
    // is a performance. The recording is transcribed on upload, so what Shane
    // reads is text, not a file he has to sit through.
    audio: true,
    questions: [
      { id: 'who_you_help',   type: 'textarea', label: 'Who do you help, and what do you do for them?' },
      { id: 'how_found',      type: 'textarea', label: 'How do people find you right now?' },
      { id: 'desired_action', type: 'textarea', label: 'When someone lands on your page, what do you want them to do?' },
      { id: 'wish_known',     type: 'textarea', label: 'What do you wish people knew about you before they reach out?' },
      { id: 'proud_of',       type: 'textarea', label: "Anything you're proud of — years doing this, numbers, names, awards." },
    ],
  },

  {
    id: 'operations',
    screen: 'How it runs',
    title: 'How the business runs',
    intro:
      'A few questions about the business behind the site. ' +
      '"Not sure" is a completely fine answer and it\'s useful to us.',
    // Persisted as its own block on the record (record.operations), not mixed
    // into the page answers. These feed the monthly program, not the build,
    // and Shane needs to pull them out separately later.
    internal: true,
    questions: [
      { id: 'first_step',     type: 'textarea', notSure: true, label: "Someone decides to hire you today. What's the actual first step for them?" },
      { id: 'calls_mid_job',  type: 'textarea', notSure: true, label: "What happens when a customer calls and you're in the middle of a job?" },
      { id: 'gbp',            type: 'textarea', notSure: true, label: 'Do you have a Google Business Profile? When did you last look at it?' },
      { id: 'payments',       type: 'textarea', notSure: true, label: 'How do people pay you?' },
      { id: 'email_capture',  type: 'textarea', notSure: true, label: 'Are you collecting email addresses anywhere right now?' },
      { id: 'local_search',   type: 'textarea', notSure: true, label: 'If someone searched for what you do in your area, would you come up?' },
      { id: 'time_sink',      type: 'textarea', notSure: true, label: 'What part of running the business side of things eats the most time?' },
    ],
  },

  {
    id: 'look',
    screen: 'Pick a look',
    title: 'Pick a look',
    intro: '',
    questions: [
      { id: 'template',     type: 'template-picker', label: 'Which of these feels closest to right?', required: true },
      { id: 'sites_liked',  type: 'repeatable-text', label: 'Any sites you like the look of? Drop links.', placeholder: 'https://' },
      { id: 'sites_avoid',  type: 'textarea',        label: "Anything you definitely don't want?" },
    ],
  },

  {
    id: 'stuff',
    screen: 'Your stuff',
    title: 'Your stuff',
    intro: '',
    questions: [
      { id: 'logo',        type: 'file',         accept: 'image', label: 'Logo' },
      { id: 'photos',      type: 'files',        accept: 'image', label: 'Photos of your work, your space, your team' },
      { id: 'headshot',    type: 'file',         accept: 'image', label: 'A headshot' },
      { id: 'brand_notes', type: 'textarea',     label: 'Colors or fonts you already use' },
      { id: 'existing_copy', type: 'text-or-file', accept: 'document', label: "Any copy you've already written that should go on the page" },
    ],
  },

  {
    id: 'anything',
    screen: 'Anything else',
    title: 'Anything else',
    intro: '',
    questions: [
      { id: 'launch_must_have', type: 'textarea', label: 'Anything that has to be on the page the day it goes live?' },
      { id: 'anything_else',    type: 'textarea', label: 'Anything else we should know?' },
    ],
  },
];

// Welcome screen copy. Edit freely.
export const WELCOME = {
  title: 'Let’s build your site.',
  lede:
    'This is everything I need from you. It takes about fifteen minutes, ' +
    'and the longest part is a five-minute video you can skip and type ' +
    'instead if you’d rather.',
  handy: [
    'Your logo, if you have one',
    'A few photos of your work, your space, or your team',
    'Your domain name, if you already own one',
  ],
  reassurance:
    'Every answer saves the moment you type it. Close the tab, come back ' +
    'tomorrow, finish on your phone — your link picks up exactly where you ' +
    'left off. You can do the sections in any order.',
};

// Confirmation screen copy. {email} is replaced with the contact address.
export const CONFIRMATION = {
  title: 'Got it. That’s everything I need.',
  body: [
    'Your answers are with Shane. He builds from these directly, so nothing ' +
    'else is needed from you right now.',
    'You’ll hear back within two business days with a first look at the ' +
    'page. Changes after that are as easy as replying to that email.',
  ],
  contact: 'shane@shanegring.com',
};

// ---------------------------------------------------------------------------
// Helpers — used by both the browser app and the Function. Keep them here so
// section/question lookups can never disagree between the two.
// ---------------------------------------------------------------------------

// The id the recording is stored under. Deliberately NOT a question: the
// prompts above are the questions, and this is one of the three ways to answer
// them. Keeping it out of SECTIONS means the question list, the review screen
// and Shane's email stay exactly as briefed.
export const RECORDING_FIELD = 'recording';

export const allQuestions = () => SECTIONS.flatMap((s) => s.questions.map((q) => ({ ...q, sectionId: s.id })));

export const questionById = (id) => allQuestions().find((q) => q.id === id) || null;

export const sectionById = (id) => SECTIONS.find((s) => s.id === id) || null;

export const requiredIds = () => allQuestions().filter((q) => q.required).map((q) => q.id);

// Section ids whose answers are filed separately on the record.
export const internalSectionIds = () => SECTIONS.filter((s) => s.internal).map((s) => s.id);
