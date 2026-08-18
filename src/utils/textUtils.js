/** Lowercase + strip diacritics, so "está" and "esta" compare equal. */
export function normalize(str) {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Strip surrounding punctuation from a tapped transcript token, for matching/lookup. */
export function stripPunctuation(word) {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

/** Split flowing transcript text into tappable tokens, preserving whitespace/punctuation as separators. */
export function tokenizeTranscript(text) {
  return text.split(/(\s+)/).filter((t) => t.length > 0)
}

export function levenshtein(a, b) {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  let curr = new Array(n + 1).fill(0)

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

/**
 * "Close but not exact" heuristic: edit distance <= 2, or first/last letters
 * match with a similar length. Used to decide whether to show a hint before
 * scoring a miss.
 */
export function isCloseMatch(submitted, correct) {
  const a = normalize(submitted)
  const b = normalize(correct)
  if (a === b) return false // exact match, not "close"
  if (a.length === 0) return false

  const distance = levenshtein(a, b)
  if (distance <= 2) return true

  const sameEnds = a[0] === b[0] && a[a.length - 1] === b[b.length - 1]
  const similarLength = Math.abs(a.length - b.length) <= 2
  return sameEnds && similarLength
}

export function isExactMatch(submitted, correct) {
  return normalize(submitted) === normalize(correct)
}
