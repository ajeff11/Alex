import { forwardRef, useImperativeHandle, useRef } from 'react'
import { extractVideoId } from '../utils/youtube'

/**
 * Renders either a YouTube iframe embed or an HTML5 audio player, and
 * exposes seekTo(seconds) so transcript segments can jump playback to their
 * timestamp.
 */
const MediaPlayer = forwardRef(function MediaPlayer({ sourceType, sourceUrl }, ref) {
  const iframeRef = useRef(null)
  const audioRef = useRef(null)

  useImperativeHandle(ref, () => ({
    seekTo(seconds) {
      if (sourceType === 'youtube' && iframeRef.current) {
        iframeRef.current.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'seekTo', args: [seconds, true] }),
          '*'
        )
        iframeRef.current.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
          '*'
        )
      } else if (audioRef.current) {
        audioRef.current.currentTime = seconds
        audioRef.current.play().catch(() => {})
      }
    },
  }))

  if (sourceType === 'youtube') {
    const videoId = extractVideoId(sourceUrl)
    if (!videoId) return null
    return (
      <div className="media-player video">
        <iframe
          ref={iframeRef}
          src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0&playsinline=1`}
          title="YouTube video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          frameBorder="0"
        />
      </div>
    )
  }

  return (
    <div className="media-player audio">
      <audio ref={audioRef} controls src={sourceUrl} preload="metadata" />
    </div>
  )
})

export default MediaPlayer
