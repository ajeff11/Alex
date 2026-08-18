import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getSession } from '../db/sessions'
import { addWord, getAllWords } from '../db/wordBank'
import { translateInContext, GeminiError } from '../services/gemini'
import { tokenizeTranscript, stripPunctuation, normalize } from '../utils/textUtils'
import BottomSheet from '../components/BottomSheet'
import MediaPlayer from '../components/MediaPlayer'

function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function TranscriptViewer() {
  const { sessionId } = useParams()
  const [session, setSession] = useState(null)
  const [savedWords, setSavedWords] = useState(new Set())
  const [sheetState, setSheetState] = useState(null) // { word, sentence, status, result, error }
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const playerRef = useRef(null)
  const segmentRefs = useRef([])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally reset per session
  const translationCache = useMemo(() => new Map(), [sessionId])

  const refreshSavedWords = useCallback(async () => {
    const words = await getAllWords()
    setSavedWords(new Set(words.map((w) => normalize(w.spanishWord))))
  }, [])

  useEffect(() => {
    getSession(sessionId).then(setSession)
    refreshSavedWords()
  }, [sessionId, refreshSavedWords])

  const handleTimeUpdate = useCallback(
    (currentTime) => {
      if (!session) return
      let active = -1
      for (let i = 0; i < session.transcript.length; i++) {
        const t = session.transcript[i].startTime
        if (t != null && t <= currentTime) active = i
      }
      setActiveIndex(active)
    },
    [session]
  )

  useEffect(() => {
    if (!isPlaying || activeIndex < 0) return
    segmentRefs.current[activeIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeIndex, isPlaying])

  async function handleWordTap(rawWord, sentence) {
    const word = stripPunctuation(rawWord)
    if (!word) return
    const key = normalize(word)

    if (translationCache.has(key)) {
      setSheetState({ word, sentence, status: 'ready', result: translationCache.get(key) })
      return
    }

    setSheetState({ word, sentence, status: 'loading' })
    try {
      const result = await translateInContext(word, sentence)
      translationCache.set(key, result)
      setSheetState({ word, sentence, status: 'ready', result })
    } catch (err) {
      const message =
        err instanceof GeminiError ? err.message : 'Could not translate that word. Try again.'
      setSheetState({ word, sentence, status: 'error', error: message })
    }
  }

  async function handleAddToWordBank() {
    if (!sheetState?.result) return
    if (savedWords.has(normalize(sheetState.result.dictionaryForm || sheetState.word))) return
    await addWord({
      spanishWord: sheetState.result.dictionaryForm || sheetState.word,
      translation: sheetState.result.wordTranslation,
      contextSentence: sheetState.sentence,
      contextTranslation: sheetState.result.sentenceTranslation,
      sourceTitle: session?.sourceTitle ?? '',
      sourceUrl: session?.sourceUrl ?? '',
    })
    await refreshSavedWords()
    setSheetState(null)
  }

  if (!session) {
    return <div className="empty-state">Loading transcript…</div>
  }

  return (
    <div>
      <Link to="/" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        ← Home
      </Link>
      <h1 className="screen-title" style={{ marginTop: 8 }}>
        {session.sourceTitle}
      </h1>
      <p className="screen-subtitle">Tap any word for a contextual translation.</p>

      {session.sourceUrl && (
        <MediaPlayer
          ref={playerRef}
          sourceType={session.sourceType}
          sourceUrl={session.sourceUrl}
          onTimeUpdate={handleTimeUpdate}
          onPlayingChange={setIsPlaying}
        />
      )}

      <div className="transcript-text">
        {session.transcript.map((seg, i) => (
          <p
            className={'transcript-segment' + (i === activeIndex ? ' active' : '')}
            key={i}
            ref={(el) => {
              segmentRefs.current[i] = el
            }}
          >
            {seg.startTime != null && (
              <button
                className="segment-timestamp"
                onClick={() => playerRef.current?.seekTo(seg.startTime)}
                type="button"
                aria-label={`Play from ${formatTimestamp(seg.startTime)}`}
              >
                ▶ {formatTimestamp(seg.startTime)}
              </button>
            )}
            {tokenizeTranscript(seg.text).map((token, j) =>
              /\s+/.test(token) ? (
                <span key={j}>{token}</span>
              ) : (
                <span
                  key={j}
                  className={
                    'transcript-word' + (savedWords.has(normalize(stripPunctuation(token))) ? ' saved' : '')
                  }
                  onClick={() => handleWordTap(token, seg.text)}
                >
                  {token}
                </span>
              )
            )}
          </p>
        ))}
      </div>

      <BottomSheet open={!!sheetState} onClose={() => setSheetState(null)}>
        {sheetState && (
          <div>
            <h2 style={{ marginTop: 0 }}>{sheetState.word}</h2>
            {sheetState.status === 'loading' && (
              <p style={{ color: 'var(--text-muted)' }}>
                <span className="spinner" /> Translating…
              </p>
            )}
            {sheetState.status === 'error' && <div className="error-banner">{sheetState.error}</div>}
            {sheetState.status === 'ready' && (
              <>
                <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>{sheetState.result.wordTranslation}</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Dictionary form: {sheetState.result.dictionaryForm}
                </p>
                <div className="card" style={{ marginTop: 12 }}>
                  <p style={{ fontStyle: 'italic', margin: '0 0 6px' }}>{sheetState.sentence}</p>
                  <p style={{ color: 'var(--text-muted)', margin: 0 }}>{sheetState.result.sentenceTranslation}</p>
                </div>
                {savedWords.has(normalize(sheetState.result.dictionaryForm || sheetState.word)) ? (
                  <button className="btn btn-block" style={{ marginTop: 16 }} disabled type="button">
                    ✓ Already in Word Bank
                  </button>
                ) : (
                  <button
                    className="btn btn-accent btn-block"
                    style={{ marginTop: 16 }}
                    onClick={handleAddToWordBank}
                    type="button"
                  >
                    + Add to Word Bank
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
