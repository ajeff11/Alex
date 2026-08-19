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
// is materially less likely to hit that wall.
//
// Tries the ANDROID client first: it doesn't require guessing a currently-
// valid WEB client version string (which YouTube ties to real release
// dates and treats an obviously-stale one as a bot signal — this app's
// previous WEB-only attempt was pinned to a mid-2024 version, which is
// exactly the kind of staleness that can cause a technically-successful
// response to still come back with captions missing or degraded), and is
// what tools like yt-dlp default to for this exact reason. Falls back to
// WEB if ANDROID doesn't yield a usable response, for defense in depth.
const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'

const INNERTUBE_CLIENTS = [
  {
    clientName: 'ANDROID',
    clientVersion: '19.29.37',
    userAgent: 'com.google.android.youtube/19.29.37 (Linux; U; Android 13) gzip',
    extraContext: { androidSdkVersion: 33 },
  },
  {
    clientName: 'WEB',
    clientVersion: '2.20250101.01.00',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    extraContext: {},
  },
]

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

async function fetchPlayerResponseWithClient(videoId, client) {
  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}&prettyPrint=false`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': client.userAgent,
        Origin: 'https://www.youtube.com',
        Referer: `https://www.youtube.com/watch?v=${videoId}`,
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            hl: 'en',
            gl: 'US',
            clientName: client.clientName,
            clientVersion: client.clientVersion,
            ...client.extraContext,
          },
        },
      }),
    }
  )
  if (!res.ok) throw new Error(`Could not reach YouTube's player API (${res.status}).`)
  return res.json()
}

/**
 * Tries each InnerTube client in turn, keeping the first response that's
 * both playable and has a caption track list. Falls back to the last
 * response tried (even without captions) if none qualify, so playability
 * errors and "genuinely no captions" are still reported accurately rather
 * than masked by the retry loop.
 */
export async function fetchPlayerResponse(videoId) {
  let lastResponse = null
  for (const client of INNERTUBE_CLIENTS) {
    let response
    try {
      response = await fetchPlayerResponseWithClient(videoId, client)
    } catch {
      continue
    }
    lastResponse = response
    const status = response?.playabilityStatus?.status
    const hasCaptions = Array.isArray(response?.captions?.playerCaptionsTracklistRenderer?.captionTracks)
    if (status === 'OK' && hasCaptions) return response
  }
  return lastResponse
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

/**
 * Diagnostic: every caption track the player response actually lists, plus
 * whether that list was present at all. Used to tell apart "this video
 * genuinely has no captions" from "captionTracks came back empty even
 * though the video has captions" (e.g. if YouTube's newer transcript-panel
 * UI is backed by a different endpoint than this legacy field for some
 * videos) without guessing blind.
 */
export function listCaptionTracks(playerResponse) {
  const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  return {
    fieldPresent: Array.isArray(tracks),
    tracks: (tracks || []).map((t) => ({
      languageCode: t.languageCode,
      name: t.name?.simpleText ?? t.name?.runs?.map((r) => r.text).join('') ?? null,
      kind: t.kind ?? null,
    })),
  }
}

export function getVideoTitle(playerResponse) {
  return playerResponse?.videoDetails?.title ?? 'Untitled video'
}

export function getVideoLengthSeconds(playerResponse) {
  const raw = playerResponse?.videoDetails?.lengthSeconds
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
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
