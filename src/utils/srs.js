// SM-2 spaced repetition, per the build spec.
//
// quality: 5 = clean correct (first try, no hint), 2 = hint-assisted correct
// or wrong answer (treated as a miss for SRS purposes).

const MIN_EASE = 1.3

export function applySm2(srs, { correct, usedHint }) {
  const now = new Date()
  const nowISO = now.toISOString()

  if (correct && !usedHint) {
    const quality = 5
    let interval
    if (srs.repetitions === 0) interval = 1
    else if (srs.repetitions === 1) interval = 6
    else interval = Math.round(srs.interval * srs.easeFactor)

    const repetitions = srs.repetitions + 1
    const easeFactor = Math.max(
      MIN_EASE,
      srs.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    )

    const nextReviewDate = addDays(now, interval).toISOString()
    return { interval, repetitions, easeFactor, nextReviewDate, lastReviewedDate: nowISO }
  }

  // Incorrect, or correct-but-only-after-a-hint: both count as a miss.
  const repetitions = 0
  const interval = 1
  const easeFactor = Math.max(MIN_EASE, srs.easeFactor - 0.2)
  const nextReviewDate = addDays(now, interval).toISOString()
  return { interval, repetitions, easeFactor, nextReviewDate, lastReviewedDate: nowISO }
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** New / Learning / Due / Mastered badge for the Word Bank list. */
export function srsStatus(srs) {
  const today = new Date().toISOString()
  if (srs.repetitions === 0 && srs.lastReviewedDate === null) return 'new'
  if (srs.nextReviewDate <= today) return 'due'
  if (srs.repetitions >= 5 && srs.easeFactor >= 2.5) return 'mastered'
  return 'learning'
}
