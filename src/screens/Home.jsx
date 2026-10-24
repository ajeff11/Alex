import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { transcribeSource } from '../services/transcription'
import { saveSession, getAllSessions, deleteSession } from '../db/sessions'
import { hasApiKey } from '../services/settings'
import { parseImportedTranscript } from '../utils/transcriptImport'

export default function Home() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [sessions, setSessions] = useState([])
  const [importTitle, setImportTitle] = useState('')
  const [importText, setImportText] = useState('')
  const [importHasTimestamps, setImportHasTimestamps] = useState(false)
  const [importError, setImportError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    getAllSessions().then(setSessions)
  }, [])

  async function handleTranscribe(e) {
    e.preventDefault()
    setError('')

    if (!hasApiKey()) {
      setError('Add your Gemini API key in Settings first.')
      return
    }

    setLoading(true)
    setStatus('Starting…')
    try {
      const result = await transcribeSource(url, setStatus)
      const session = await saveSession({
        sourceTitle: result.title,
        sourceUrl: url,
        sourceType: result.sourceType,
        transcript: result.transcript,
      })
      setUrl('')
      navigate(`/session/${session.id}`)
    } catch (err) {
      setError(err.message || 'Something went wrong transcribing that source.')
    } finally {
      setLoading(false)
      setStatus('')
    }
  }

  async function handleImport(e) {
    e.preventDefault()
    setImportError('')

    const transcript = parseImportedTranscript(importText, importHasTimestamps)
    if (transcript.length === 0) {
      setImportError('Paste some transcript text first.')
      return
    }

    const session = await saveSession({
      sourceTitle: importTitle.trim() || 'Imported transcript',
      sourceUrl: '',
      sourceType: 'import',
      transcript,
    })
    setImportTitle('')
    setImportText('')
    navigate(`/session/${session.id}`)
  }

  async function handleDelete(id) {
    await deleteSession(id)
    setSessions((prev) => prev.filter((s) => s.id !== id))
  }

  function sourceLabel(sourceType) {
    if (sourceType === 'youtube') return 'YouTube'
    if (sourceType === 'import') return 'Imported'
    return 'Podcast'
  }

  return (
    <div>
      <h1 className="screen-title">Add content</h1>
      <p className="screen-subtitle">Paste a Spanish YouTube video or a direct podcast audio URL.</p>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleTranscribe} className="card">
        <div className="field" style={{ marginBottom: 12 }}>
          <input
            className="input"
            type="url"
            inputMode="url"
            placeholder="https://youtube.com/watch?v=... or https://example.com/episode.mp3"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
            required
          />
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
          {loading ? (
            <>
              <span className="spinner" /> {status || 'Transcribing…'}
            </>
          ) : (
            'Transcribe'
          )}
        </button>
      </form>

      <details className="card">
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Or paste a transcript</summary>
        <form onSubmit={handleImport} style={{ marginTop: 14 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 0 }}>
            Paste text from anywhere — e.g. the output of{' '}
            <code>tools/transcript/fetch_transcript.py</code>. No audio or video to play along
            with, just the transcript.
          </p>

          {importError && <div className="error-banner">{importError}</div>}

          <div className="field">
            <label className="field-label" htmlFor="importTitle">
              Title (optional)
            </label>
            <input
              id="importTitle"
              className="input"
              value={importTitle}
              onChange={(e) => setImportTitle(e.target.value)}
              placeholder="e.g. the video's title"
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="importText">
              Transcript text
            </label>
            <textarea
              id="importText"
              className="input"
              style={{ minHeight: 140, resize: 'vertical', fontFamily: 'inherit' }}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Pega aquí el texto de la transcripción…"
            />
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 16,
              fontSize: '0.9rem',
              color: 'var(--text-muted)',
            }}
          >
            <input
              type="checkbox"
              checked={importHasTimestamps}
              onChange={(e) => setImportHasTimestamps(e.target.checked)}
            />
            Each line starts with a [MM:SS] timestamp
          </label>

          <button className="btn btn-accent btn-block" type="submit">
            Save transcript
          </button>
        </form>
      </details>

      {sessions.length > 0 && (
        <>
          <h2 style={{ fontSize: '1rem', color: 'var(--text-muted)', marginTop: 28 }}>Recent transcripts</h2>
          {sessions.map((s) => (
            <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Link to={`/session/${s.id}`} style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
                <div className="word-spanish" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.sourceTitle}
                </div>
                <div className="word-translation">
                  {sourceLabel(s.sourceType)} · {new Date(s.dateAdded).toLocaleDateString()}
                </div>
              </Link>
              <button className="icon-btn" onClick={() => handleDelete(s.id)} aria-label="Delete transcript" type="button">
                ✕
              </button>
            </div>
          ))}
        </>
      )}

      {sessions.length === 0 && !loading && (
        <div className="empty-state">No transcripts yet. Paste a link above to get started.</div>
      )}
    </div>
  )
}
