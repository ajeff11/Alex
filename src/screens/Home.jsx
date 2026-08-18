import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { transcribeSource } from '../services/transcription'
import { saveSession, getAllSessions, deleteSession } from '../db/sessions'
import { hasApiKey } from '../services/settings'

export default function Home() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [sessions, setSessions] = useState([])
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

  async function handleDelete(id) {
    await deleteSession(id)
    setSessions((prev) => prev.filter((s) => s.id !== id))
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
                  {s.sourceType === 'youtube' ? 'YouTube' : 'Podcast'} · {new Date(s.dateAdded).toLocaleDateString()}
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
