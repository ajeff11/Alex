import { db, newId, nowISO } from './db'

export function freshSrs() {
  return {
    interval: 0,
    repetitions: 0,
    easeFactor: 2.5,
    nextReviewDate: nowISO(),
    lastReviewedDate: null,
  }
}

/**
 * @param {{spanishWord: string, translation: string, contextSentence: string,
 *   contextTranslation: string, sourceTitle: string, sourceUrl: string}} fields
 */
export async function addWord(fields) {
  const item = {
    id: newId(),
    spanishWord: fields.spanishWord,
    translation: fields.translation,
    contextSentence: fields.contextSentence,
    contextTranslation: fields.contextTranslation ?? '',
    sourceTitle: fields.sourceTitle ?? '',
    sourceUrl: fields.sourceUrl ?? '',
    dateAdded: nowISO(),
    srs: freshSrs(),
  }
  await db.wordBank.put(item)
  return item
}

export async function getAllWords() {
  return db.wordBank.toArray()
}

export async function getWord(id) {
  return db.wordBank.get(id)
}

export async function updateWord(id, changes) {
  await db.wordBank.update(id, changes)
  return db.wordBank.get(id)
}

export async function deleteWord(id) {
  await db.wordBank.delete(id)
}

export async function isWordSaved(spanishWord) {
  const norm = spanishWord.toLowerCase()
  const count = await db.wordBank
    .filter((w) => w.spanishWord.toLowerCase() === norm)
    .count()
  return count > 0
}

export async function getDueWords(limit = 20) {
  const today = nowISO()
  const all = await db.wordBank.toArray()
  return all
    .filter((w) => w.srs.nextReviewDate <= today)
    .sort((a, b) => a.srs.nextReviewDate.localeCompare(b.srs.nextReviewDate))
    .slice(0, limit)
}

/** Fallback queue when nothing is due: pull from the full bank, weighted toward lower ease factors. */
export async function getPracticeAheadWords(limit = 20) {
  const all = await db.wordBank.toArray()
  if (all.length === 0) return []
  const weighted = all.map((w) => ({
    word: w,
    // lower easeFactor -> higher weight. easeFactor ranges [1.3, ~well above 2.5]
    weight: 1 / Math.max(w.srs.easeFactor, 1.3),
  }))
  const picked = []
  const pool = [...weighted]
  while (picked.length < Math.min(limit, all.length) && pool.length > 0) {
    const total = pool.reduce((sum, p) => sum + p.weight, 0)
    let r = Math.random() * total
    let idx = 0
    for (; idx < pool.length; idx++) {
      r -= pool[idx].weight
      if (r <= 0) break
    }
    idx = Math.min(idx, pool.length - 1)
    picked.push(pool[idx].word)
    pool.splice(idx, 1)
  }
  return picked
}

export async function replaceAllWords(words) {
  await db.wordBank.clear()
  await db.wordBank.bulkPut(words)
}

export async function mergeWords(words) {
  const existing = await db.wordBank.toArray()
  const existingBySpanish = new Map(existing.map((w) => [w.spanishWord.toLowerCase(), w]))
  for (const w of words) {
    const dupe = existingBySpanish.get(w.spanishWord.toLowerCase())
    if (!dupe) {
      await db.wordBank.put(w)
    }
  }
}
