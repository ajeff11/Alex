/** Client-side mirror of api/_lib/youtube.js's extractVideoId — kept separate
 * since api/ and src/ ship to different runtimes (serverless vs. browser). */
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
    if (/^[\w-]{11}$/.test(url)) return url
  }
  return null
}
