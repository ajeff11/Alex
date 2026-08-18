// Unofficial YouTube caption-fetching helpers. YouTube's internal endpoints
// used here (timedtext, ytInitialPlayerResponse) are undocumented and can
// change without notice — when they do, the app falls back to Gemini audio
// transcription (see api/transcribe.js).

export function extractVideoId(url) {
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be') return u.pathname.slice(1)
    if (u.hostname.endsWith('youtube.com')) {
      if (u.pathname === '/watch') return u.searchParams.get('v')
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2]
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2]
    }
  } catch {
    // not a URL — maybe a bare video ID was passed
    if (/^[\w-]{11}$/.test(url)) return url
  }
  return null
}

export async function fetchWatchPage(videoId) {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })
  if (!res.ok) throw new Error(`Could not load YouTube video page (${res.status}).`)
  return res.text()
}

export function parsePlayerResponse(html) {
  const match = html.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});/s) ||
    html.match(/ytInitialPlayerResponse"?\s*=\s*(\{.+?\})\s*;\s*(?:var|const|let)/s)
  if (!match) return null
  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

export function pickSpanishCaptionTrack(playerResponse) {
  const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  if (!tracks || tracks.length === 0) return null

  const isSpanish = (t) => (t.languageCode || '').toLowerCase().startsWith('es')
  const manual = tracks.find((t) => isSpanish(t) && t.kind !== 'asr')
  if (manual) return manual
  const auto = tracks.find((t) => isSpanish(t) && t.kind === 'asr')
  if (auto) return auto
  return null
}

export function getVideoTitle(playerResponse) {
  return playerResponse?.videoDetails?.title ?? 'Untitled video'
}

/** Fetch a caption track in JSON3 format and normalize to transcript segments. */
export async function fetchCaptionSegments(baseUrl) {
  const url = baseUrl.includes('fmt=') ? baseUrl : `${baseUrl}&fmt=json3`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not fetch caption track (${res.status}).`)
  const data = await res.json()
  const events = data.events ?? []
  const segments = []
  for (const ev of events) {
    if (!ev.segs) continue
    const text = ev.segs
      .map((s) => s.utf8)
      .join('')
      .replace(/\n/g, ' ')
      .trim()
    if (!text) continue
    segments.push({ text, startTime: typeof ev.tStartMs === 'number' ? ev.tStartMs / 1000 : null })
  }
  return segments
}
