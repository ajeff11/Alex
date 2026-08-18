// Local-only settings storage. Gemini API keys never leave this device
// except in direct calls to Google's endpoint (see services/gemini.js) or,
// for the podcast-audio upload step, to this app's own serverless function.
const KEYS = {
  apiKeys: 'immersion.geminiApiKeys', // JSON: [{id, label, key}]
  activeKeyId: 'immersion.activeGeminiKeyId',
  legacyApiKey: 'immersion.geminiApiKey', // pre-multi-key storage, migrated once
  difficulty: 'immersion.defaultDifficulty',
}

export const DIFFICULTIES = ['easy', 'medium', 'hard']

function newKeyId() {
  return crypto.randomUUID?.() ?? `key-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function readApiKeys() {
  try {
    const raw = localStorage.getItem(KEYS.apiKeys)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeApiKeys(list) {
  localStorage.setItem(KEYS.apiKeys, JSON.stringify(list))
}

let migrated = false
function ensureMigrated() {
  if (migrated) return
  migrated = true
  const legacy = localStorage.getItem(KEYS.legacyApiKey)
  if (legacy && legacy.trim() && readApiKeys().length === 0) {
    const entry = { id: newKeyId(), label: 'My key', key: legacy.trim() }
    writeApiKeys([entry])
    localStorage.setItem(KEYS.activeKeyId, entry.id)
  }
  if (legacy) localStorage.removeItem(KEYS.legacyApiKey)
}

/** @returns {{id: string, label: string, key: string}[]} */
export function getApiKeys() {
  ensureMigrated()
  return readApiKeys()
}

export function addApiKey(key, label) {
  ensureMigrated()
  const trimmed = key.trim()
  if (!trimmed) return null
  const list = readApiKeys()
  const entry = { id: newKeyId(), label: label?.trim() || `Key ${list.length + 1}`, key: trimmed }
  writeApiKeys([...list, entry])
  if (list.length === 0) setActiveKeyId(entry.id)
  return entry
}

export function removeApiKey(id) {
  ensureMigrated()
  const list = readApiKeys().filter((k) => k.id !== id)
  writeApiKeys(list)
  if (getActiveKeyId() === id) {
    setActiveKeyId(list[0]?.id ?? null)
  }
}

export function renameApiKey(id, label) {
  ensureMigrated()
  const trimmed = label.trim()
  if (!trimmed) return
  writeApiKeys(readApiKeys().map((k) => (k.id === id ? { ...k, label: trimmed } : k)))
}

export function getActiveKeyId() {
  ensureMigrated()
  return localStorage.getItem(KEYS.activeKeyId)
}

export function setActiveKeyId(id) {
  if (id) localStorage.setItem(KEYS.activeKeyId, id)
  else localStorage.removeItem(KEYS.activeKeyId)
}

/**
 * Keys in the order Gemini calls should try them: the active one first
 * (whichever last succeeded, or was explicitly picked), then the rest in
 * stored order. Used to auto-fall-back to another key when one's free-tier
 * daily quota is exhausted.
 */
export function getOrderedApiKeys() {
  const list = getApiKeys()
  const activeId = getActiveKeyId()
  const idx = list.findIndex((k) => k.id === activeId)
  if (idx <= 0) return list
  return [list[idx], ...list.slice(0, idx), ...list.slice(idx + 1)]
}

export function hasApiKey() {
  return getApiKeys().length > 0
}

export function getDefaultDifficulty() {
  const val = localStorage.getItem(KEYS.difficulty)
  return DIFFICULTIES.includes(val) ? val : 'medium'
}

export function setDefaultDifficulty(difficulty) {
  if (DIFFICULTIES.includes(difficulty)) {
    localStorage.setItem(KEYS.difficulty, difficulty)
  }
}
