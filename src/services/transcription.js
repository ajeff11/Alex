import { getApiKey } from './settings'
import { transcribeFromUploadedFile, MissingApiKeyError, GeminiError } from './gemini'

function isYoutubeUrl(url) {
  return /(?:youtube\.com|youtu\.be)/i.test(url)
}

/**
 * @param {string} sourceUrl
 * @param {(status: string) => void} [onProgress]
 * @returns {Promise<{title: string, sourceType: 'youtube'|'podcast', transcript: {text: string, startTime: number|null}[]}>}
 */
export async function transcribeSource(sourceUrl, onProgress = () => {}) {
  const trimmed = sourceUrl.trim()
  if (!trimmed) throw new Error('Paste a YouTube link or podcast audio URL first.')

  if (isYoutubeUrl(trimmed)) {
    onProgress('Looking for existing captions…')
    const captionResult = await tryYoutubeCaptions(trimmed)
    if (captionResult) return captionResult

    onProgress('No usable captions — transcribing audio with Gemini…')
    return transcribeViaGeminiFallback(trimmed, 'youtube', onProgress)
  }

  onProgress('Transcribing podcast audio with Gemini…')
  return transcribeViaGeminiFallback(trimmed, 'podcast', onProgress)
}

async function tryYoutubeCaptions(url) {
  let res
  try {
    res = await fetch(`/api/youtube-transcript?url=${encodeURIComponent(url)}`)
  } catch {
    return null // network hiccup on the caption path — fall through to Gemini
  }
  if (!res.ok) return null
  const data = await res.json()
  if (!data.available) return null
  return {
    title: data.title || 'Untitled video',
    sourceType: 'youtube',
    transcript: data.transcript,
  }
}

async function transcribeViaGeminiFallback(url, sourceType, onProgress) {
  const apiKey = getApiKey()
  if (!apiKey) throw new MissingApiKeyError()

  const uploadRes = await fetch('/api/transcribe-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceUrl: url, sourceType, apiKey }),
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
    sourceType,
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
