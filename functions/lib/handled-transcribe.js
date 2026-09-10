/**
 * Handled intake — turn the recording into text.
 *
 * Workers AI, @cf/openai/whisper-large-v3-turbo, via the AI binding. Same
 * platform the audio already lives on, so no new vendor and no new key — just
 * a binding. At $0.00051 per audio minute a five-minute recording costs about
 * a quarter of a cent, which is why this runs on every recording without
 * anyone having to decide it is worth it.
 *
 * Why it runs at upload and not at submit: the client is still on the page, so
 * a failure can offer them a re-record while they still care. By the time they
 * press send the text is already on the record and Shane's email goes out
 * complete.
 *
 * Degrading is the normal case, not an edge case. No AI binding, a model
 * error, a file too big — all of them leave the audio attached and a status on
 * the record saying what happened. Shane still gets the recording; he just has
 * to listen to it.
 */

const MODEL = '@cf/openai/whisper-large-v3-turbo';

// Whisper takes base64, which inflates the payload by a third and has to be
// held in memory. The in-browser recorder produces ~2.4 MB for five minutes, so
// this ceiling only ever catches an uploaded voice memo recorded at a very high
// bitrate. Chunking is the real fix if that turns out to be common.
const MAX_BYTES = 25 * 1024 * 1024;

export async function transcribe(env, key, { businessName = '', prompts = [] } = {}) {
  // Local review only. Workers AI needs a real account, so without this there
  // is no way to see how a transcript renders on the review screen or in
  // Shane's email until the binding exists. Gated on an env var that is only
  // ever set in .dev.vars, ignored entirely whenever a real AI binding is
  // present, and the text says what it is so it can never be mistaken for a
  // real transcription of real audio.
  if (!env.AI && env.HANDLED_TRANSCRIBE_STUB) {
    const head = await env.HANDLED_BUCKET.head(key);
    return {
      status: 'ok',
      stub: true,
      text:
        'We fit and service boilers right across the north of the city' +
        `${businessName ? `, trading as ${businessName}` : ''}. ` +
        'Most people find us on word of mouth, or they see the van. What I ' +
        'want off the page really is the phone to ring — people call, we book ' +
        'them in, that is the whole thing. I wish people knew we do the small ' +
        'jobs too, not just full installs, because a lot assume we are too big ' +
        'for a dripping tap. Eighteen years doing this now and we have never ' +
        'had a callback we could not put right.',
      words: 68,
      vtt: null,
      model: 'stub',
      at: new Date().toISOString(),
      audioBytes: head?.size ?? 0,
    };
  }

  if (!env.AI) return skipped('no_ai_binding');

  const obj = await env.HANDLED_BUCKET.get(key);
  if (!obj) return skipped('audio_missing');

  const bytes = new Uint8Array(await obj.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) return skipped('audio_too_large');

  try {
    const result = await env.AI.run(MODEL, {
      audio: toBase64(bytes),
      task: 'transcribe',
      // Priming Whisper with the business name and the questions being answered
      // measurably improves proper nouns — which for these clients is the whole
      // point, since their own trading name is the word most likely to be
      // mangled and the word Shane most needs spelled correctly.
      initial_prompt: buildPrompt(businessName, prompts),
    });

    const text = (result?.text ?? result?.transcription_info?.text ?? '').trim();
    if (!text) return skipped('empty_transcript');

    return {
      status: 'ok',
      text,
      words: result?.word_count ?? result?.transcription_info?.word_count ?? text.split(/\s+/).length,
      vtt: result?.segments?.[0]?.vtt ?? result?.vtt ?? null,
      model: MODEL,
      at: new Date().toISOString(),
    };
  } catch (e) {
    console.log('handled-transcribe: ' + (e?.message || e));
    return skipped('model_error');
  }
}

function buildPrompt(businessName, prompts) {
  const parts = [];
  if (businessName) parts.push(`The speaker owns a business called ${businessName}.`);
  if (prompts.length) parts.push(`They are answering: ${prompts.join(' ')}`);
  // Whisper's initial_prompt is a short context hint, not an instruction; long
  // ones degrade the result, so it is capped rather than passed whole.
  return parts.join(' ').slice(0, 900);
}

const skipped = (reason) => ({ status: 'skipped', reason, text: '', at: new Date().toISOString() });

// Chunked so a multi-megabyte file cannot blow the argument limit on apply().
function toBase64(bytes) {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// What the client is told when transcription did not produce text. Never an
// error code, and never an apology — just what happened and what it means for
// them, which in every case is "nothing, Shane has the audio".
export const STATUS_COPY = {
  no_ai_binding: 'Your recording is saved — Shane will listen to it.',
  audio_missing: 'We couldn’t find that recording. Try recording it again.',
  audio_too_large: 'That’s a long one, so Shane will listen to it rather than read it back.',
  empty_transcript: 'We couldn’t make out any speech. Check your microphone is on, then try again.',
  model_error: 'We couldn’t turn this one into text — Shane will listen to your recording.',
};
