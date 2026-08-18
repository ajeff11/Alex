import { hasApiKey, getOrderedApiKeys, setActiveKeyId } from './settings'
import { transcribeYoutubeUrl, transcribeFromUploadedFile, MissingApiKeyError, GeminiError } from './gemini'
import { withWakeLock } from '../utils/wakeLock'

function isYoutubeUrl(url) {
  return /(?:youtube\.com|youtu\.be)/i.test(url)
}

// Gemini ingests the whole video (not audio-only) for the direct-URL
// fallback, so both wall-clock time and token/quota use scale with length.
// Past this, the wait and quota cost stop being worth it for a video that
// most likely also isn't captioned — surface that clearly instead of
// leaving the user watching a spinner for several minutes.
const MAX_DIRECT_TRANSCRIBE_SECONDS = 25 * 60

function formatMinutes(seconds) {
  return Math.round(seconds / 60)
}

/** Human-readable summary of what the caption lookup actually found, for
 * the progress text shown right before falling back to Gemini — so a "no
 * captions" result is diagnosable from the UI alone, no dev tools needed. */
function describeCaptionDiagnostic(captionLookup) {
  const diag = captionLookup.captionDiagnostic
  if (!diag) return captionLookup.reason || 'no caption info returned'
  if (!diag.fieldPresent) return 'YouTube returned no caption data at all for this video'
  if (diag.tracks.length === 0) return 'YouTube listed zero caption tracks'
  const langs = diag.tracks.map((t) => `${t.languageCode}${t.kind === 'asr' ? ' auto' : ''}`).join(', ')
  return `found tracks: ${langs}`
}

/**
 * @param {string} sourceUrl
 * @param {(status: string) => void} [onProgress]
 * @returns {Promise<{title: string, sourceType: 'youtube'|'podcast', transcript: {text: string, startTime: number|null}[]}>}
 */
export async function transcribeSource(sourceUrl, onProgress = () => {}) {
  const trimmed = sourceUrl.trim()
  if (!trimmed) throw new Error('Paste a YouTube link or podcast audio URL first.')

  return withWakeLock(() => runTranscription(trimmed, onProgress))
}

async function runTranscription(trimmed, onProgress) {
  if (isYoutubeUrl(trimmed)) {
    onProgress('Looking for existing captions…')
    const captionLookup = await fetchYoutubeCaptions(trimmed)
    if (captionLookup.available) {
      return {
        title: captionLookup.title || 'Untitled video',
        sourceType: 'youtube',
        transcript: captionLookup.transcript,
      }
    }

    // No usable caption track (or the lookup itself failed, e.g. YouTube
    // blocking the caption request). Ask Gemini to fetch and transcribe the
    // video directly by URL instead — Google's own servers do the fetching,
    // which sidesteps YouTube's bot-detection blocking of datacenter IPs
    // (the failure mode that breaks scraping-based approaches entirely).
    if (
      typeof captionLookup.lengthSeconds === 'number' &&
      captionLookup.lengthSeconds > MAX_DIRECT_TRANSCRIBE_SECONDS
    ) {
      throw new GeminiError(
        `This video is about ${formatMinutes(captionLookup.lengthSeconds)} minutes long and has no Spanish captions. Direct video transcription only works well under ${formatMinutes(MAX_DIRECT_TRANSCRIBE_SECONDS)} minutes — it gets slow and eats into your daily Gemini quota fast beyond that. Try a shorter clip, or a captioned video.`
      )
    }

    onProgress(
      `No usable Spanish captions (${describeCaptionDiagnostic(captionLookup)}) — asking Gemini to transcribe the video directly (this can take a few minutes)…`
    )
    if (!hasApiKey()) throw new MissingApiKeyError()
    const transcript = await transcribeYoutubeUrl(trimmed)
    return {
      title: captionLookup.title || guessTitleFromUrl(trimmed),
      sourceType: 'youtube',
      transcript,
    }
  }

  onProgress('Transcribing podcast audio with Gemini…')
  return transcribePodcast(trimmed, onProgress)
}

async function fetchYoutubeCaptions(url) {
  try {
    const res = await fetch(`/api/youtube-transcript?url=${encodeURIComponent(url)}`)
    if (!res.ok) return { available: false }
    return await res.json()
  } catch {
    return { available: false } // network hiccup on the caption path — fall through to Gemini
  }
}

/**
 * Uploads podcast audio server-side, trying each saved API key in turn —
 * same auto-fallback-on-quota-exhaustion behavior as the Gemini calls
 * themselves (see callGenerateContent in services/gemini.js), just done
 * client-side here since this step goes through our own serverless route
 * rather than calling Gemini directly.
 */
async function transcribePodcast(url, onProgress) {
  const keys = getOrderedApiKeys()
  if (keys.length === 0) throw new MissingApiKeyError()

  let lastError
  for (const entry of keys) {
    try {
      const { fileUri, mimeType } = await uploadPodcastAudio(url, entry.key)
      setActiveKeyId(entry.id)

      onProgress('Audio uploaded — asking Gemini to transcribe…')
      const transcript = await transcribeFromUploadedFile(fileUri, mimeType)
      return { title: guessTitleFromUrl(url), sourceType: 'podcast', transcript }
    } catch (err) {
      lastError = err
      if (!(err instanceof GeminiError) || !err.isRateLimit) throw err
      // this key's free-tier quota is exhausted for now — try the next one
    }
  }

  throw (
    lastError ??
    new GeminiError('All saved Gemini keys are out of free-tier quota for now. Try again later.', {
      isRateLimit: true,
    })
  )
}

async function uploadPodcastAudio(url, apiKey) {
  const uploadRes = await fetch('/api/transcribe-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceUrl: url, apiKey }),
  })
  if (!uploadRes.ok) {
    const body = await safeJson(uploadRes)
    throw new GeminiError(body?.error || `Could not fetch/upload audio (${uploadRes.status}).`, {
      status: uploadRes.status,
      isRateLimit: uploadRes.status === 429,
    })
  }
  return uploadRes.json()
}

function guessTitleFromUrl(url) {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').filter(Boolean).pop()
    return last ? decodeURIComponent(last) : u.hostname
  } catch {
    return 'Untitled audio'
  }
}

async function safeJson(res) {
  try {
    return await res.json()
  } catch {
    return null
  }
}
