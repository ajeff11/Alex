// Parses transcript text pasted by the user (e.g. output from
// tools/transcript/fetch_transcript.py) into the same {text, startTime}
// segment shape every other transcript source in the app uses.
const TIMESTAMP_LINE = /^\[(\d{1,2}):(\d{2})\]\s*(.*)$/

/**
 * @param {string} rawText
 * @param {boolean} hasTimestamps whether each line is prefixed with [MM:SS]
 *   (matches fetch_transcript.py's --timestamps output)
 * @returns {{text: string, startTime: number|null}[]}
 */
export function parseImportedTranscript(rawText, hasTimestamps) {
  const text = rawText.replace(/\r\n/g, '\n').trim()
  if (!text) return []

  if (hasTimestamps) {
    const segments = []
    let current = null
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim()
      if (!line) continue
      const match = line.match(TIMESTAMP_LINE)
      if (match) {
        const [, minutes, seconds, rest] = match
        current = { text: rest.trim(), startTime: Number(minutes) * 60 + Number(seconds) }
        segments.push(current)
      } else if (current) {
        // Soft-wrapped continuation of the previous timestamped line.
        current.text = `${current.text} ${line}`.trim()
      } else {
        segments.push({ text: line, startTime: null })
      }
    }
    return segments.filter((s) => s.text)
  }

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length > 1) {
    return lines.map((t) => ({ text: t, startTime: null }))
  }

  // A single pasted blob with no line breaks — split into sentences so it
  // still reads as a flowing transcript instead of one giant paragraph.
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) ?? [text]
  return sentences
    .map((s) => s.trim())
    .filter(Boolean)
    .map((t) => ({ text: t, startTime: null }))
}
