// Local-only settings storage. The Gemini API key never leaves this device
// except in direct calls to Google's endpoint (see services/gemini.js).
const KEYS = {
  apiKey: 'immersion.geminiApiKey',
  difficulty: 'immersion.defaultDifficulty',
}

export const DIFFICULTIES = ['easy', 'medium', 'hard']

export function getApiKey() {
  return localStorage.getItem(KEYS.apiKey) ?? ''
}

export function setApiKey(key) {
  if (key) localStorage.setItem(KEYS.apiKey, key)
  else localStorage.removeItem(KEYS.apiKey)
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

export function hasApiKey() {
  return getApiKey().trim().length > 0
}
