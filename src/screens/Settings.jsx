import { useState, useEffect, useRef } from 'react'
import {
  getApiKeys,
  addApiKey,
  removeApiKey,
  getActiveKeyId,
  setActiveKeyId,
  getDefaultDifficulty,
  setDefaultDifficulty,
} from '../services/settings'
import { testApiKey } from '../services/gemini'
import { exportBackup, importBackup } from '../services/backup'
import { db } from '../db/db'

function maskKey(key) {
  if (key.length <= 10) return '•'.repeat(key.length)
  return `${key.slice(0, 6)}${'•'.repeat(6)}${key.slice(-4)}`
}

export default function Settings() {
  const [keys, setKeys] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [newLabel, setNewLabel] = useState('')
  const [newKey, setNewKey] = useState('')
  const [showNewKey, setShowNewKey] = useState(false)
  const [keyStatuses, setKeyStatuses] = useState({}) // id -> 'checking' | 'valid' | 'invalid'
  const [difficulty, setDifficulty] = useState('medium')
  const [importMode, setImportMode] = useState(null) // null | 'confirm'
  const [pendingImportFile, setPendingImportFile] = useState(null)
  const [message, setMessage] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => {
    refreshKeys()
    setDifficulty(getDefaultDifficulty())
  }, [])

  function refreshKeys() {
    setKeys(getApiKeys())
    setActiveId(getActiveKeyId())
  }

  function handleAddKey() {
    const trimmed = newKey.trim()
    if (!trimmed) return
    addApiKey(trimmed, newLabel)
    setNewLabel('')
    setNewKey('')
    setShowNewKey(false)
    refreshKeys()
    flash('Key added.')
  }

  function handleUseKey(id) {
    setActiveKeyId(id)
    refreshKeys()
  }

  function handleDeleteKey(id) {
    removeApiKey(id)
    refreshKeys()
  }

  async function handleTestKey(id, key) {
    setKeyStatuses((s) => ({ ...s, [id]: 'checking' }))
    const ok = await testApiKey(key)
    setKeyStatuses((s) => ({ ...s, [id]: ok ? 'valid' : 'invalid' }))
  }

  function handleDifficultyChange(value) {
    setDifficulty(value)
    setDefaultDifficulty(value)
  }

  function flash(msg) {
    setMessage(msg)
    setTimeout(() => setMessage(''), 2500)
  }

  async function handleExport() {
    await exportBackup()
    flash('Backup downloaded.')
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
    localStorage.clear()
    refreshKeys()
    setConfirmClear(false)
    flash('All data cleared.')
  }

  return (
    <div>
      <h1 className="screen-title">Settings</h1>
      <p className="screen-subtitle">Everything below is stored only on this device.</p>

      {message && <div className="notice-banner">{message}</div>}

      <section className="card">
        <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Gemini API keys</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 0 }}>
          Save more than one key and the app automatically switches to the next when one hits its daily
          free-tier quota — no need to swap keys by hand.{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            Get a free key
          </a>
          . Never sent anywhere except Google's API.
        </p>

        {keys.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {keys.map((k) => {
              const isActive = k.id === activeId
              const status = keyStatuses[k.id]
              return (
                <div
                  key={k.id}
                  className="word-row"
                  style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}
                >
                  <div className="word-main">
                    <div className="word-spanish" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {k.label}
                      {isActive && <span className="badge badge-mastered">Active</span>}
                    </div>
                    <div className="word-translation" style={{ fontFamily: 'monospace' }}>
                      {maskKey(k.key)}
                    </div>
                    {status === 'valid' && <p style={{ color: 'var(--success)', margin: '4px 0 0' }}>Key works.</p>}
                    {status === 'invalid' && (
                      <p style={{ color: 'var(--danger)', margin: '4px 0 0' }}>Key rejected or request failed.</p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {!isActive && (
                      <button className="btn" onClick={() => handleUseKey(k.id)} type="button">
                        Use
                      </button>
                    )}
                    <button
                      className="btn"
                      onClick={() => handleTestKey(k.id, k.key)}
                      disabled={status === 'checking'}
                      type="button"
                    >
                      {status === 'checking' ? <span className="spinner" /> : 'Test'}
                    </button>
                    <button className="btn btn-danger" onClick={() => handleDeleteKey(k.id)} type="button">
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {keys.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No keys saved yet.</p>
        )}

        <div style={{ borderTop: keys.length > 0 ? '1px solid var(--border)' : 'none', paddingTop: keys.length > 0 ? 14 : 0 }}>
          <div className="field">
            <label className="field-label" htmlFor="newKeyLabel">
              Label (optional)
            </label>
            <input
              id="newKeyLabel"
              className="input"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Personal, Backup"
            />
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label className="field-label" htmlFor="newKeyValue">
              API key
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="newKeyValue"
                className="input"
                type={showNewKey ? 'text' : 'password'}
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="AIza..."
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button className="btn" onClick={() => setShowNewKey((s) => !s)} type="button">
                {showNewKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <button className="btn btn-primary btn-block" onClick={handleAddKey} disabled={!newKey.trim()} type="button">
            + Add key
          </button>
        </div>
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
              This deletes your word bank, transcripts, saved keys, and settings from this device. This
              cannot be undone unless you have an export.
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
