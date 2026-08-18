import ytdl from '@distube/ytdl-core'
import { fetchAudioBuffer, uploadBufferToGemini } from './_lib/geminiUpload.js'
import { extractVideoId } from './_lib/youtube.js'

export const config = { maxDuration: 60 }

// Resolves an audio source (direct podcast URL, or a YouTube video with no
// usable captions) to bytes, then uploads those bytes to Gemini's Files API
// so the client can call generateContent with just a small file reference —
// the actual audio never has to round-trip through the browser.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { sourceUrl, sourceType, apiKey } = req.body || {}
  if (!sourceUrl || !apiKey) {
    res.status(400).json({ error: 'Missing sourceUrl or apiKey.' })
    return
  }

  try {
    let buffer, mimeType

    if (sourceType === 'youtube') {
      const videoId = extractVideoId(sourceUrl)
      if (!videoId) {
        res.status(400).json({ error: 'Could not parse a YouTube video ID from that URL.' })
        return
      }
      const info = await ytdl.getInfo(videoId)
      const format = ytdl.chooseFormat(info.formats, { quality: 'lowestaudio', filter: 'audioonly' })
      if (!format) {
        res.status(422).json({ error: 'No audio-only stream is available for this video.' })
        return
      }
      ;({ buffer, mimeType } = await fetchAudioBuffer(format.url))
    } else {
      ;({ buffer, mimeType } = await fetchAudioBuffer(sourceUrl))
    }

    const fileUri = await uploadBufferToGemini({ apiKey, buffer, mimeType })
    res.status(200).json({ fileUri, mimeType })
  } catch (err) {
    const message = String(err.message || err)
    if (sourceType === 'youtube' && /sign in to confirm/i.test(message)) {
      res.status(502).json({
        error:
          "YouTube blocked this server from reading the video's audio (it thinks the request is a bot, which is common for cloud servers like this one). This only affects YouTube videos with no Spanish captions — captioned videos and direct podcast URLs aren't affected.",
      })
      return
    }
    res.status(502).json({ error: message })
  }
}
