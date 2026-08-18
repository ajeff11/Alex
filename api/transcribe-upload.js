import { fetchAudioBuffer, uploadBufferToGemini } from './_lib/geminiUpload.js'

export const config = { maxDuration: 60 }

// Fetches a direct podcast audio URL server-side (avoids browser CORS) and
// uploads the bytes to Gemini's Files API, so the client can call
// generateContent with just a small file reference — the actual audio never
// has to round-trip through the browser.
//
// YouTube no longer goes through this route: Gemini can fetch a YouTube
// video directly by URL itself (see transcribeYoutubeUrl in
// src/services/gemini.js), which sidesteps YouTube's bot-detection blocking
// of datacenter IPs entirely — a problem this route's old ytdl-core-based
// audio extraction ran straight into and had no reliable fix for.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { sourceUrl, apiKey } = req.body || {}
  if (!sourceUrl || !apiKey) {
    res.status(400).json({ error: 'Missing sourceUrl or apiKey.' })
    return
  }

  try {
    const { buffer, mimeType } = await fetchAudioBuffer(sourceUrl)
    const fileUri = await uploadBufferToGemini({ apiKey, buffer, mimeType })
    res.status(200).json({ fileUri, mimeType })
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) })
  }
}
