import { db, newId, nowISO } from './db'

/**
 * @param {{sourceTitle: string, sourceUrl: string, sourceType: 'youtube'|'podcast'|'import',
 *   transcript: {text: string, startTime: number|null}[]}} fields
 */
export async function saveSession(fields) {
  const session = {
    id: newId(),
    sourceTitle: fields.sourceTitle,
    sourceUrl: fields.sourceUrl,
    sourceType: fields.sourceType,
    transcript: fields.transcript,
    dateAdded: nowISO(),
  }
  await db.sessions.put(session)
  return session
}

export async function getSession(id) {
  return db.sessions.get(id)
}

export async function getAllSessions() {
  const all = await db.sessions.toArray()
  return all.sort((a, b) => b.dateAdded.localeCompare(a.dateAdded))
}

export async function deleteSession(id) {
  await db.sessions.delete(id)
}
