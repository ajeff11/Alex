import { forwardRef, useImperativeHandle, useRef, useEffect } from 'react'
import { extractVideoId } from '../utils/youtube'

let youtubeApiPromise = null
function loadYoutubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (youtubeApiPromise) return youtubeApiPromise
  youtubeApiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve(window.YT)
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(script)
  })
  return youtubeApiPromise
}

/**
 * Renders either a YouTube player or an HTML5 audio player, and:
 * - exposes seekTo(seconds) so transcript segments can jump playback there
 * - reports currentTime via onTimeUpdate and play state via onPlayingChange,
 *   so the transcript can highlight/auto-scroll to the active segment
 *
 * YouTube uses the real IFrame Player API (not raw postMessage) because
 * tracking playback position requires calling player.getCurrentTime() —
 * there's no native timeupdate-style event for embedded YouTube players, so
 * this polls it on an interval while playing, which is the standard
 * approach for transcript-sync UIs.
 */
const MediaPlayer = forwardRef(function MediaPlayer(
  { sourceType, sourceUrl, onTimeUpdate, onPlayingChange, measureRef, autoFollow, onToggleAutoFollow },
  ref
) {
  const containerRef = useRef(null)
  const audioRef = useRef(null)
  const ytPlayerRef = useRef(null)
  const pollRef = useRef(null)

  useImperativeHandle(ref, () => ({
    seekTo(seconds) {
      if (sourceType === 'youtube' && ytPlayerRef.current) {
        ytPlayerRef.current.seekTo(seconds, true)
        ytPlayerRef.current.playVideo()
      } else if (audioRef.current) {
        audioRef.current.currentTime = seconds
        audioRef.current.play().catch(() => {})
      }
    },
    pause() {
      if (sourceType === 'youtube') {
        ytPlayerRef.current?.pauseVideo?.()
      } else {
        audioRef.current?.pause()
      }
    },
  }))

  useEffect(() => {
    if (sourceType !== 'youtube') return undefined
    const videoId = extractVideoId(sourceUrl)
    if (!videoId || !containerRef.current) return undefined

    let cancelled = false
    loadYoutubeIframeApi().then((YT) => {
      if (cancelled || !containerRef.current) return
      ytPlayerRef.current = new YT.Player(containerRef.current, {
        videoId,
        playerVars: { rel: 0, playsinline: 1 },
        events: {
          onStateChange: (e) => {
            const playing = e.data === YT.PlayerState.PLAYING
            onPlayingChange?.(playing)
            clearInterval(pollRef.current)
            if (playing) {
              pollRef.current = setInterval(() => {
                onTimeUpdate?.(ytPlayerRef.current?.getCurrentTime() ?? 0)
              }, 250)
            }
          },
        },
      })
    })

    return () => {
      cancelled = true
      clearInterval(pollRef.current)
      ytPlayerRef.current?.destroy?.()
      ytPlayerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-init only when the source actually changes
  }, [sourceType, sourceUrl])

  const followToggle = onToggleAutoFollow && (
    <button className="follow-toggle" onClick={onToggleAutoFollow} type="button">
      {autoFollow ? '🔒 Auto-scroll on' : '🔓 Free scroll'}
    </button>
  )

  if (sourceType === 'youtube') {
    const videoId = extractVideoId(sourceUrl)
    if (!videoId) return null
    return (
      <div className="media-player video" ref={measureRef}>
        <div className="video-frame">
          <div ref={containerRef} />
        </div>
        {followToggle}
      </div>
    )
  }

  return (
    <div className="media-player audio" ref={measureRef}>
      <audio
        ref={audioRef}
        controls
        src={sourceUrl}
        preload="metadata"
        onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
        onPlay={() => onPlayingChange?.(true)}
        onPause={() => onPlayingChange?.(false)}
      />
      {followToggle}
    </div>
  )
})

export default MediaPlayer
