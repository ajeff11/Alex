import { getOrderedApiKeys, setActiveKeyId } from './settings'

// Single choke point for all Gemini calls. Swap models/endpoints here without
// touching UI code. Uses the free-tier Flash models directly via REST so we
// don't need to ship the full SDK for three call shapes.
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
// gemini-2.5-flash was retired ("no longer available to new users") as of
// this writing; verified live against the free tier that 3.6-flash is its
// replacement and behaves the same for our JSON-schema-constrained calls.
const TEXT_MODEL = 'gemini-3.6-flash'
const AUDIO_MODEL = 'gemini-3.6-flash'

// This model "thinks" by default even for trivial requests — verified live
// that a plain word-translation call took ~14s and burned ~160 hidden
// "thinking" tokens with no thinkingConfig, vs. ~1.7s and zero thinking
// tokens with this set. Used for the small, well-defined, latency-sensitive
// calls (translate, quiz generation) where deep reasoning isn't needed;
// deliberately left off for transcription, where accuracy matters more.
const LOW_LATENCY_THINKING = { thinkingLevel: 'low' }

// A word translation or quiz sentence normally comes back in 1-10s (verified
// live). Reports of 50s+ waits are far outside that range — almost
// certainly Gemini's own backend queuing/load variance on the free tier,
// which is outside our control, but there's no reason to let a user sit
// through a full minute of it. Capping the wait tighter and retrying once
// turns "silently very slow" into "fails fast and quietly tries again" —
// usually faster overall than waiting out one slow attempt.
const FAST_TIMEOUT_MS = 15_000

export class GeminiError extends Error {
  constructor(message, { status, isRateLimit = false, isTimeout = false } = {}) {
    super(message)
    this.name = 'GeminiError'
    this.status = status
    this.isRateLimit = isRateLimit
    this.isTimeout = isTimeout
  }
}

export class MissingApiKeyError extends GeminiError {
  constructor() {
    super('No Gemini API key set. Add one in Settings.')
    this.name = 'MissingApiKeyError'
  }
}

// Plain fetch() has no default timeout — without one, a slow or stuck
// response (e.g. Gemini ingesting a long video) leaves the UI spinning
// forever with no feedback. Every call gets a bound; the transcription
// paths pass a longer one explicitly since video ingestion is genuinely slow.
const DEFAULT_TIMEOUT_MS = 60_000

/**
 * Calls generateContent with a single, explicit key — no key rotation.
 * The default export below (callGenerateContent) wraps this with rotation
 * across saved keys; testApiKey calls this directly since testing a
 * specific key should never silently fall through to a different one.
 */
async function fetchGenerateContentOnce(model, body, key, timeoutMs, _retried = false) {
  const url = `${API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(key)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new GeminiError(
        `Gemini didn't respond within ${Math.round(timeoutMs / 1000)}s. Long videos can take a while to process, or this may be a network issue — try again, or try a shorter/captioned source.`,
        { isTimeout: true }
      )
    }
    // Not a timeout — a genuine connection failure. On iOS, backgrounding a
    // PWA (screen lock, app switch) mid-request can kill the connection
    // outright; that's transient, so one silent retry before giving up.
    if (!_retried) {
      return fetchGenerateContentOnce(model, body, key, timeoutMs, true)
    }
    throw new GeminiError(
      'Could not reach Gemini — check your network connection. If this was a long transcription, keeping the app open and the screen on while it runs helps avoid this on iPhone.'
    )
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    let detail = ''
    try {
      const errJson = await res.json()
      detail = errJson?.error?.message ?? ''
    } catch {
      // ignore parse failure, use status text
    }
    if (res.status === 429) {
      throw new GeminiError(
        "Gemini's free-tier daily quota is used up for now. Try again later, or check your usage in Google AI Studio.",
        { status: 429, isRateLimit: true }
      )
    }
    if (res.status === 400 && /API key/i.test(detail)) {
      throw new GeminiError('Gemini rejected your API key. Check it in Settings.', { status: 400 })
    }
    throw new GeminiError(detail || `Gemini request failed (${res.status}).`, { status: res.status })
  }

  return res.json()
}

/**
 * Calls generateContent, automatically falling back through saved API keys
 * (in getOrderedApiKeys() order — last-successful key first) when one hits
 * its free-tier daily quota (429). Only a 429 triggers a fallback; any other
 * error (bad request, timeout, network failure after its own retry) is
 * real and rethrown immediately, since switching keys wouldn't fix it.
 * Pass an explicit `apiKey` to bypass rotation entirely (used by
 * testApiKey, where falling through to a different key would defeat the
 * point of testing this one).
 */
async function callGenerateContent(model, body, { apiKey, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (apiKey) {
    return fetchGenerateContentOnce(model, body, apiKey, timeoutMs)
  }

  const keys = getOrderedApiKeys()
  if (keys.length === 0) throw new MissingApiKeyError()

  let lastError
  for (const entry of keys) {
    try {
      const result = await fetchGenerateContentOnce(model, body, entry.key, timeoutMs)
      setActiveKeyId(entry.id)
      return result
    } catch (err) {
      lastError = err
      if (!(err instanceof GeminiError) || !err.isRateLimit) throw err
      // 429 — this key's free-tier quota is exhausted for now, try the next one
    }
  }

  throw new GeminiError(
    keys.length > 1
      ? `All ${keys.length} saved Gemini keys are out of free-tier quota for now. Try again later, or add another key in Settings.`
      : lastError?.message ?? "Gemini's free-tier daily quota is used up for now. Try again later, or add another key in Settings.",
    { status: 429, isRateLimit: true }
  )
}

/**
 * Same as callGenerateContent, but on a timeout specifically (not a real
 * error — just no response within timeoutMs) tries once more with a fresh
 * timeout window before giving up. Used for the fast, interactive calls
 * (translate, quiz generation) so one unusually slow attempt doesn't force
 * the user to wait through the entire thing — a second attempt is very
 * likely to land within the normal 1-10s range instead.
 */
async function callWithTimeoutRetry(model, body, options) {
  try {
    return await callGenerateContent(model, body, options)
  } catch (err) {
    if (err instanceof GeminiError && err.isTimeout) {
      return callGenerateContent(model, body, options)
    }
    throw err
  }
}

function extractText(response) {
  const parts = response?.candidates?.[0]?.content?.parts ?? []
  return parts.map((p) => p.text ?? '').join('')
}

function parseJsonResponse(response) {
  const text = extractText(response)
  try {
    return JSON.parse(text)
  } catch {
    throw new GeminiError('Gemini returned an unexpected response. Try again.')
  }
}

/**
 * Test that an API key is valid by making a minimal request.
 * @returns {Promise<boolean>}
 */
export async function testApiKey(apiKey) {
  try {
    await callGenerateContent(
      TEXT_MODEL,
      {
        contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ok' }] }],
        generationConfig: { thinkingConfig: LOW_LATENCY_THINKING },
      },
      { apiKey }
    )
    return true
  } catch {
    return false
  }
}

const TRANSCRIBE_PROMPT = `Transcribe the Spanish spoken in this audio/video. Return ONLY JSON matching this shape:
{"segments": [{"text": "<spanish sentence or phrase>", "startTime": <seconds as number, or null if unknown>}]}
Break the transcript into natural sentence- or phrase-level segments. Preserve accents and punctuation. Do not translate — keep the Spanish text as spoken.`

const TRANSCRIBE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    segments: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING' },
          startTime: { type: 'NUMBER', nullable: true },
        },
        required: ['text'],
      },
    },
  },
  required: ['segments'],
}

// Transcribing audio/video is much slower than a text call — ingesting a
// long file can genuinely take minutes, so this gets a much longer bound
// than the default before we call it "stuck" and surface an error.
const TRANSCRIBE_TIMEOUT_MS = 5 * 60_000

async function transcribeFileData(filePart) {
  const response = await callGenerateContent(
    AUDIO_MODEL,
    {
      contents: [{ role: 'user', parts: [{ text: TRANSCRIBE_PROMPT }, filePart] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: TRANSCRIBE_SCHEMA },
    },
    { timeoutMs: TRANSCRIBE_TIMEOUT_MS }
  )

  const parsed = parseJsonResponse(response)
  return (parsed.segments ?? []).map((s) => ({
    text: s.text,
    startTime: typeof s.startTime === 'number' ? s.startTime : null,
  }))
}

/**
 * Transcribe audio that has already been uploaded to Gemini's Files API
 * (see api/transcribe-upload.js, which does the upload server-side to avoid
 * routing large audio files through the browser).
 * @returns {Promise<{text: string, startTime: number|null}[]>}
 */
export async function transcribeFromUploadedFile(fileUri, mimeType) {
  return transcribeFileData({ file_data: { mime_type: mimeType, file_uri: fileUri } })
}

/**
 * Transcribe a YouTube video directly by URL — Gemini fetches the video
 * itself server-side (Google's own infrastructure, not ours), which sidesteps
 * YouTube's bot-detection blocking of datacenter IPs entirely. This is the
 * fallback used when no usable caption track exists; captions are still
 * tried first since they're free and instant, while this consumes real
 * tokens proportional to video length (Gemini ingests it as full video, not
 * audio-only).
 * @param {string} youtubeUrl canonical https://www.youtube.com/watch?v=... or youtu.be URL
 * @returns {Promise<{text: string, startTime: number|null}[]>}
 */
export async function transcribeYoutubeUrl(youtubeUrl) {
  return transcribeFileData({ file_data: { file_uri: youtubeUrl } })
}

/**
 * Given a tapped Spanish word and its surrounding sentence, get a
 * context-aware English translation of both the word and the full sentence.
 * @returns {Promise<{wordTranslation: string, dictionaryForm: string, sentenceTranslation: string}>}
 */
export async function translateInContext(word, sentence) {
  const prompt = `You are helping a Spanish learner. Given this Spanish sentence and a specific word tapped within it, provide:
1. "wordTranslation": the English translation of the word AS USED in this specific context (account for reflexive verbs, idioms, ambiguous meanings).
2. "dictionaryForm": the dictionary/base (lemma) form of the word (infinitive for verbs, singular masculine for adjectives, singular for nouns).
3. "sentenceTranslation": a natural English translation of the full sentence.

Sentence: "${sentence}"
Tapped word: "${word}"

Return ONLY JSON: {"wordTranslation": "...", "dictionaryForm": "...", "sentenceTranslation": "..."}`

  const response = await callWithTimeoutRetry(
    TEXT_MODEL,
    {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        thinkingConfig: LOW_LATENCY_THINKING,
        maxOutputTokens: 200,
        responseSchema: {
          type: 'OBJECT',
          properties: {
            wordTranslation: { type: 'STRING' },
            dictionaryForm: { type: 'STRING' },
            sentenceTranslation: { type: 'STRING' },
          },
          required: ['wordTranslation', 'dictionaryForm', 'sentenceTranslation'],
        },
      },
    },
    { timeoutMs: FAST_TIMEOUT_MS }
  )

  return parseJsonResponse(response)
}

/**
 * Generate a new Spanish cloze sentence for a saved word (never reuses the
 * original saved context sentence).
 * @param {string} spanishWord dictionary form
 * @param {string} translation English meaning
 * @param {'easy'|'medium'|'hard'} difficulty
 * @returns {Promise<{sentence: string, blankedSentence: string, answer: string, distractors: string[]}>}
 *   `answer` is the exact conjugated/inflected form used in `sentence`.
 *   `distractors` (3 plausible wrong Spanish words) is only populated for 'easy'.
 */
export async function generateClozeSentence(spanishWord, translation, difficulty) {
  const wantsDistractors = difficulty === 'easy'
  const prompt = `Create a NEW Spanish example sentence (do not reuse a famous quote) that uses the word "${spanishWord}" (English: "${translation}"), appropriate for a ${difficulty} difficulty language-learning quiz. The word may be conjugated/inflected as needed for the sentence.

Return ONLY JSON:
{
  "sentence": "<full Spanish sentence, natural, one sentence, 6-16 words>",
  "answer": "<the exact form of the word as it appears in the sentence, including conjugation>",
  "blankedSentence": "<the same sentence with that exact form replaced by ____>"
  ${wantsDistractors ? ',"distractors": ["<3 other plausible Spanish words that do NOT fit the blank, similar part of speech>"]' : ''}
}`

  const properties = {
    sentence: { type: 'STRING' },
    answer: { type: 'STRING' },
    blankedSentence: { type: 'STRING' },
  }
  const required = ['sentence', 'answer', 'blankedSentence']
  if (wantsDistractors) {
    properties.distractors = { type: 'ARRAY', items: { type: 'STRING' } }
    required.push('distractors')
  }

  const response = await callWithTimeoutRetry(
    TEXT_MODEL,
    {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        thinkingConfig: LOW_LATENCY_THINKING,
        maxOutputTokens: 300,
        responseSchema: { type: 'OBJECT', properties, required },
      },
    },
    { timeoutMs: FAST_TIMEOUT_MS }
  )

  const parsed = parseJsonResponse(response)
  return { distractors: [], ...parsed }
}
