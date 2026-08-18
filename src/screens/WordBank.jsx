import { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { getAllWords } from '../db/wordBank'
import { srsStatus } from '../utils/srs'
import { exportBackup, importBackup } from '../services/backup'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'learning', label: 'Learning' },
  { key: 'due', label: 'Due' },
  { key: 'mastered', label: 'Mastered' },
]

export default function WordBank() {
  const [words, setWords] = useState(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [message, setMessage] = useState('')
  const [importMode, setImportMode] = useState(null)
  const [pendingFile, setPendingFile] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    refresh()
  }, [])

  async function refresh() {
    const all = await getAllWords()
    all.sort((a, b) => b.dateAdded.localeCompare(a.dateAdded))
    setWords(all)
  }

  const filtered = useMemo(() => {
    if (!words) return []
    const q = query.trim().toLowerCase()
    return words.filter((w) => {
      if (filter !== 'all' && srsStatus(w.srs) !== filter) return false
      if (!q) return true
      return (
        w.spanishWord.toLowerCase().includes(q) ||
        w.translation.toLowerCase().includes(q) ||
        w.sourceTitle.toLowerCase().includes(q)
      )
    })
  }, [words, query, filter])

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
    setPendingFile(file)
    setImportMode('confirm')
    e.target.value = ''
  }

  async function handleImport(mode) {
    if (!pendingFile) return
    try {
      const result = await importBackup(pendingFile, mode)
      flash(`Imported ${result.wordCount} words.`)
      await refresh()
    } catch (err) {
      flash(`Import failed: ${err.message}`)
    }
    setImportMode(null)
    setPendingFile(null)
  }

  function flash(msg) {
    setMessage(msg)
    setTimeout(() => setMessage(''), 3000)
  }

  return (
    <div>
      <h1 className="screen-title">Word Bank</h1>
      <p className="screen-subtitle">{words ? `${words.length} words saved` : 'Loading…'}</p>

      {message && <div className="notice-banner">{message}</div>}

      <div className="search-row">
        <input
          className="input"
          placeholder="Search words…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 16, paddingBottom: 2 }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className="btn"
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              flexShrink: 0,
              background: filter === f.key ? 'var(--primary)' : undefined,
              color: filter === f.key ? 'var(--primary-text)' : undefined,
              borderColor: filter === f.key ? 'var(--primary)' : undefined,
            }}
            onClick={() => setFilter(f.key)}
            type="button"
          >
            {f.label}
          </button>
        ))}
      </div>

      {words && words.length === 0 && (
        <div className="empty-state">
          No words saved yet. Transcribe something and tap words to build your bank.
        </div>
      )}

      {words && words.length > 0 && filtered.length === 0 && (
        <div className="empty-state">No words match.</div>
      )}

      {filtered.length > 0 && (
        <div className="card">
          {filtered.map((w) => (
            <Link to={`/words/${w.id}`} key={w.id} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="word-row">
                <div className="word-main">
                  <div className="word-spanish">{w.spanishWord}</div>
                  <div className="word-translation">{w.translation}</div>
                </div>
                <span className={`badge badge-${srsStatus(w.srs)}`}>{srsStatus(w.srs)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 20 }}>
        <button className="btn btn-accent" onClick={handleExport} type="button">
          Export
        </button>
        <button className="btn" onClick={handleImportClick} type="button">
          Import
        </button>
        <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleFileChosen} />
      </div>

      {importMode === 'confirm' && (
        <div className="card" style={{ marginTop: 12 }}>
          <p style={{ fontSize: '0.9rem' }}>
            Import <strong>{pendingFile?.name}</strong> — merge with your current word bank, or replace it
            entirely?
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
                setPendingFile(null)
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
