import { getAllWords, replaceAllWords, mergeWords } from '../db/wordBank'
import { getAllSessions } from '../db/sessions'
import { db } from '../db/db'

const BACKUP_VERSION = 1

export async function buildBackupPayload() {
  const [words, sessions] = await Promise.all([getAllWords(), getAllSessions()])
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    wordBank: words,
    sessions,
  }
}

export async function exportBackup() {
  const payload = await buildBackupPayload()
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `spanish-immersion-backup-${date}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * @param {File} file
 * @param {'merge'|'replace'} mode
 */
export async function importBackup(file, mode) {
  const text = await file.text()
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error('Not a valid JSON file.')
  }

  const words = Array.isArray(payload.wordBank) ? payload.wordBank : []
  const sessions = Array.isArray(payload.sessions) ? payload.sessions : []

  if (mode === 'replace') {
    await replaceAllWords(words)
    await db.sessions.clear()
    if (sessions.length) await db.sessions.bulkPut(sessions)
  } else {
    await mergeWords(words)
    const existingIds = new Set((await getAllSessions()).map((s) => s.id))
    const newSessions = sessions.filter((s) => !existingIds.has(s.id))
    if (newSessions.length) await db.sessions.bulkPut(newSessions)
  }

  return { wordCount: words.length, sessionCount: sessions.length }
}
