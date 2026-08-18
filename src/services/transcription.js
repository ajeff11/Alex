import { getApiKey } from './settings'
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

    onProgress('No usable captions — asking Gemini to transcribe the video directly (this can take a few minutes)…')
    if (!getApiKey()) throw new MissingApiKeyError()
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

async function transcribePodcast(url, onProgress) {
  const apiKey = getApiKey()
  if (!apiKey) throw new MissingApiKeyError()

  const uploadRes = await fetch('/api/transcribe-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceUrl: url, apiKey }),
  })
  if (!uploadRes.ok) {
    const body = await safeJson(uploadRes)
    throw new GeminiError(body?.error || `Could not fetch/upload audio (${uploadRes.status}).`, {
      status: uploadRes.status,
    })
  }
  const { fileUri, mimeType } = await uploadRes.json()

  onProgress('Audio uploaded — asking Gemini to transcribe…')
  const transcript = await transcribeFromUploadedFile(fileUri, mimeType)

  return {
    title: guessTitleFromUrl(url),
    sourceType: 'podcast',
    transcript,
  }
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
