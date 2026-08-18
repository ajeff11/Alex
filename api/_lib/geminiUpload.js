// Server-side mirror of the browser upload in src/services/gemini.js.
// Runs here (not in the browser) because the audio source itself
// (podcast host, YouTube CDN) usually doesn't send CORS headers a browser
// fetch would need — the serverless function has no such restriction.
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

// Guard against pathological inputs blowing the function's memory budget.
const MAX_BYTES = 300 * 1024 * 1024

export async function fetchAudioBuffer(sourceUrl) {
  const res = await fetch(sourceUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SpanishImmersionApp/1.0)' },
  })
  if (!res.ok) {
    throw new Error(`Could not fetch audio from source (${res.status}).`)
  }
  const contentLength = Number(res.headers.get('content-length') || 0)
  if (contentLength && contentLength > MAX_BYTES) {
    throw new Error('Audio file is too large to process (over 300MB).')
  }
  const mimeType = res.headers.get('content-type')?.split(';')[0] || guessMimeType(sourceUrl)
  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.length > MAX_BYTES) {
    throw new Error('Audio file is too large to process (over 300MB).')
  }
  return { buffer, mimeType }
}

function guessMimeType(url) {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase()
  const map = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', aac: 'audio/aac' }
  return map[ext] || 'audio/mpeg'
}

export async function uploadBufferToGemini({ apiKey, buffer, mimeType }) {
  const startRes = await fetch(`${API_BASE}/files?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(buffer.length),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: 'audio-upload' } }),
  })
  if (!startRes.ok) {
    const detail = await safeJson(startRes)
    throw new Error(`Could not start Gemini upload (${startRes.status}): ${detail}`)
  }
  const uploadUrl = startRes.headers.get('x-goog-upload-url')
  if (!uploadUrl) throw new Error('Gemini did not return an upload URL.')

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(buffer.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: buffer,
  })
  if (!uploadRes.ok) {
    const detail = await safeJson(uploadRes)
    throw new Error(`Gemini upload failed (${uploadRes.status}): ${detail}`)
  }
  const uploaded = await uploadRes.json()
  const uri = uploaded?.file?.uri
  if (!uri) throw new Error('Gemini upload did not return a file URI.')
  return uri
}

async function safeJson(res) {
  try {
    const j = await res.json()
    return j?.error?.message ?? JSON.stringify(j)
  } catch {
    return res.statusText
  }
}
