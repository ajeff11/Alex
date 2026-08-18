/**
 * Keeps the screen awake for the duration of `fn`, best-effort. iOS Safari's
 * default screen timeout is the single most common way a long-running
 * transcription request gets its network connection killed mid-flight — the
 * OS suspends background/locked tabs. Feature-detected: silently does
 * nothing on browsers without support, or if the permission is denied.
 */
export async function withWakeLock(fn) {
  let sentinel = null
  if ('wakeLock' in navigator) {
    try {
      sentinel = await navigator.wakeLock.request('screen')
    } catch {
      sentinel = null // e.g. NotAllowedError — proceed without it
    }
  }
  try {
    return await fn()
  } finally {
    sentinel?.release().catch(() => {})
  }
}
