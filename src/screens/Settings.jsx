import { useState, useEffect, useRef } from 'react'
import {
  getApiKey,
  setApiKey as saveApiKey,
  getDefaultDifficulty,
  setDefaultDifficulty,
} from '../services/settings'
import { testApiKey } from '../services/gemini'
import { exportBackup, importBackup } from '../services/backup'
import { db } from '../db/db'

export default function Settings() {
  const [apiKey, setApiKeyState] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [keyStatus, setKeyStatus] = useState(null) // null | 'checking' | 'valid' | 'invalid'
  const [difficulty, setDifficulty] = useState('medium')
  const [importMode, setImportMode] = useState(null) // null | 'confirm'
  const [pendingImportFile, setPendingImportFile] = useState(null)
  const [message, setMessage] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    setApiKeyState(getApiKey())
    setDifficulty(getDefaultDifficulty())
  }, [])

  function handleSaveKey() {
    saveApiKey(apiKey.trim())
    setMessage('API key saved.')
    setKeyStatus(null)
    setTimeout(() => setMessage(''), 2500)
  }

  async function handleTestKey() {
    setKeyStatus('checking')
    const ok = await testApiKey(apiKey.trim())
    setKeyStatus(ok ? 'valid' : 'invalid')
  }

  function handleDifficultyChange(value) {
    setDifficulty(value)
    setDefaultDifficulty(value)
  }

  async function handleExport() {
    await exportBackup()
    setMessage('Backup downloaded.')
    setTimeout(() => setMessage(''), 2500)
  }

  function handleImportClick() {
    fileInputRef.current?.click()
  }

  function handleFileChosen(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingImportFile(file)
    setImportMode('confirm')
    e.target.value = ''
  }

  async function handleImport(mode) {
    if (!pendingImportFile) return
    try {
      const result = await importBackup(pendingImportFile, mode)
      setMessage(`Imported ${result.wordCount} words${result.sessionCount ? ` and ${result.sessionCount} transcripts` : ''}.`)
    } catch (err) {
      setMessage(`Import failed: ${err.message}`)
    }
    setImportMode(null)
    setPendingImportFile(null)
    setTimeout(() => setMessage(''), 4000)
  }

  async function handleClearAll() {
    await db.wordBank.clear()
    await db.sessions.clear()
    saveApiKey('')
    localStorage.clear()
    setApiKeyState('')
    setConfirmClear(false)
    setMessage('All data cleared.')
    setTimeout(() => setMessage(''), 2500)
  }

  return (
    <div>
      <h1 className="screen-title">Settings</h1>
      <p className="screen-subtitle">Everything below is stored only on this device.</p>

      {message && <div className="notice-banner">{message}</div>}

      <section className="card">
        <div className="field">
          <label className="field-label" htmlFor="apiKey">
            Gemini API key
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="apiKey"
              className="input"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKeyState(e.target.value)
                setKeyStatus(null)
              }}
              placeholder="AIza..."
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button className="btn" onClick={() => setShowKey((s) => !s)} type="button">
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 8 }}>
            Get a free key at{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              Google AI Studio
            </a>
            . Never sent anywhere except Google's API.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={handleSaveKey} type="button">
            Save key
          </button>
          <button className="btn" onClick={handleTestKey} disabled={!apiKey.trim() || keyStatus === 'checking'} type="button">
            {keyStatus === 'checking' ? <span className="spinner" /> : 'Test key'}
          </button>
        </div>
        {keyStatus === 'valid' && <p style={{ color: 'var(--success)', marginTop: 8 }}>Key works.</p>}
        {keyStatus === 'invalid' && <p style={{ color: 'var(--danger)', marginTop: 8 }}>Key rejected or request failed.</p>}
      </section>

      <section className="card">
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="field-label" htmlFor="difficulty">
            Default quiz difficulty
          </label>
          <select
            id="difficulty"
            className="input"
            value={difficulty}
            onChange={(e) => handleDifficultyChange(e.target.value)}
          >
            <option value="easy">Easy — multiple choice</option>
            <option value="medium">Medium — type the word, English cue shown</option>
            <option value="hard">Hard — type the word, no Spanish shown</option>
          </select>
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Backup</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Export your word bank as a JSON file periodically. Safari can clear PWA storage after long
          periods of inactivity — a backup is the only way to recover.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-accent" onClick={handleExport} type="button">
            Export word bank
          </button>
          <button className="btn" onClick={handleImportClick} type="button">
            Import backup
          </button>
          <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleFileChosen} />
        </div>

        {importMode === 'confirm' && (
          <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <p style={{ fontSize: '0.9rem' }}>
              Import <strong>{pendingImportFile?.name}</strong> — merge with your current word bank, or
              replace it entirely?
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => handleImport('merge')} type="button">
                Merge
              </button>
              <button className="btn btn-danger" onClick={() => handleImport('replace')} type="button">
                Replace all
              </button>
              <button
                className="btn"
                onClick={() => {
                  setImportMode(null)
                  setPendingImportFile(null)
                }}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0, fontSize: '1rem', color: 'var(--danger)' }}>Danger zone</h2>
        {!confirmClear ? (
          <button className="btn btn-danger" onClick={() => setConfirmClear(true)} type="button">
            Clear all data
          </button>
        ) : (
          <div>
            <p style={{ fontSize: '0.9rem' }}>
              This deletes your word bank, transcripts, and settings from this device. This cannot be
              undone unless you have an export.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-danger" onClick={handleClearAll} type="button">
                Yes, clear everything
              </button>
              <button className="btn" onClick={() => setConfirmClear(false)} type="button">
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
