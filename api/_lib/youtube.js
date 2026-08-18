// Unofficial YouTube caption-fetching helpers. YouTube's internal endpoints
// used here are undocumented and can change without notice — when a video
// has no usable caption track (or this lookup fails outright), the app
// falls back to asking Gemini to transcribe the video directly by URL (see
// transcribeYoutubeUrl in src/services/gemini.js), which Google's own
// servers fetch — no scraping involved for that path at all.
//
// This deliberately does NOT scrape the public /watch HTML page. Requests
// for that full page from datacenter IPs (which is what every serverless
// host's outbound IP looks like to YouTube) get served an interstitial
// "Sign in to confirm you're not a bot" page instead of the real page.
// Calling the InnerTube `player` endpoint directly — the same JSON API
// youtube.com's own web client calls over XHR for this data — is the
// technique current unofficial tools (yt-dlp, youtubei.js) use instead, and
// is materially less likely to hit that wall. It isn't immune to YouTube
// tightening things further, but it's the more robust of the two.
const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'
const INNERTUBE_CLIENT_VERSION = '2.20240726.00.00'

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

export async function fetchPlayerResponse(videoId) {
  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}&prettyPrint=false`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Origin: 'https://www.youtube.com',
        Referer: `https://www.youtube.com/watch?v=${videoId}`,
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            hl: 'en',
            gl: 'US',
            clientName: 'WEB',
            clientVersion: INNERTUBE_CLIENT_VERSION,
          },
        },
      }),
    }
  )
  if (!res.ok) throw new Error(`Could not reach YouTube's player API (${res.status}).`)
  return res.json()
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
