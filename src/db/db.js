import Dexie from 'dexie'

// Single IndexedDB database for all app data. No backend — everything lives
// on-device; see services/backup.js for the manual JSON export/import path.
export const db = new Dexie('spanish-immersion')

db.version(1).stores({
  // id is a uuid string (primary key)
  wordBank: 'id, spanishWord, dateAdded, srs.nextReviewDate',
  sessions: 'id, dateAdded, sourceType',
})

export function newId() {
  return crypto.randomUUID()
}

export function nowISO() {
  return new Date().toISOString()
}
