import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getWord, updateWord, deleteWord } from '../db/wordBank'
import { srsStatus } from '../utils/srs'

export default function WordDetail() {
  const { wordId } = useParams()
  const navigate = useNavigate()
  const [word, setWord] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ spanishWord: '', translation: '' })
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    getWord(wordId).then((w) => {
      setWord(w)
      if (w) setForm({ spanishWord: w.spanishWord, translation: w.translation })
    })
  }, [wordId])

  async function handleSave() {
    const updated = await updateWord(wordId, {
      spanishWord: form.spanishWord.trim(),
      translation: form.translation.trim(),
    })
    setWord(updated)
    setEditing(false)
  }

  async function handleDelete() {
    await deleteWord(wordId)
    navigate('/words')
  }

  if (!word) return <div className="empty-state">Loading…</div>

  return (
    <div>
      <Link to="/words" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        ← Word Bank
      </Link>

      <div className="card" style={{ marginTop: 12 }}>
        {editing ? (
          <>
            <div className="field">
              <label className="field-label">Spanish word</label>
              <input
                className="input"
                value={form.spanishWord}
                onChange={(e) => setForm((f) => ({ ...f, spanishWord: e.target.value }))}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Translation</label>
              <input
                className="input"
                value={form.translation}
                onChange={(e) => setForm((f) => ({ ...f, translation: e.target.value }))}
              />
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <h1 className="screen-title" style={{ marginBottom: 4 }}>
                {word.spanishWord}
              </h1>
              <span className={`badge badge-${srsStatus(word.srs)}`}>{srsStatus(word.srs)}</span>
            </div>
            <p style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>{word.translation}</p>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {editing ? (
            <>
              <button className="btn btn-primary" onClick={handleSave} type="button">
                Save
              </button>
              <button className="btn" onClick={() => setEditing(false)} type="button">
                Cancel
              </button>
            </>
          ) : (
            <button className="btn" onClick={() => setEditing(true)} type="button">
              Edit
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Context</h2>
        <p style={{ fontStyle: 'italic' }}>{word.contextSentence}</p>
        <p style={{ color: 'var(--text-muted)' }}>{word.contextTranslation}</p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Details</h2>
        <p style={{ margin: '4px 0' }}>Source: {word.sourceTitle || '—'}</p>
        <p style={{ margin: '4px 0' }}>Added: {new Date(word.dateAdded).toLocaleDateString()}</p>
        <p style={{ margin: '4px 0' }}>
          Reviews: {word.srs.repetitions} · Ease: {word.srs.easeFactor.toFixed(2)} · Next review:{' '}
          {new Date(word.srs.nextReviewDate).toLocaleDateString()}
        </p>
      </div>

      {!confirmDelete ? (
        <button className="btn btn-danger btn-block" onClick={() => setConfirmDelete(true)} type="button">
          Delete word
        </button>
      ) : (
        <div className="card">
          <p style={{ fontSize: '0.9rem' }}>Delete this word from your bank? This cannot be undone.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-danger" onClick={handleDelete} type="button">
              Yes, delete
            </button>
            <button className="btn" onClick={() => setConfirmDelete(false)} type="button">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
