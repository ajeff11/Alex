import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { getDueWords, getPracticeAheadWords, updateWord } from '../db/wordBank'
import { generateClozeSentence, GeminiError } from '../services/gemini'
import { applySm2 } from '../utils/srs'
import { isExactMatch, isCloseMatch, normalize } from '../utils/textUtils'
import { getDefaultDifficulty } from '../services/settings'

const DIFFICULTY_LABEL = {
  easy: 'Easy · Multiple choice',
  medium: 'Medium · Type it, meaning shown',
  hard: 'Hard · Type it, meaning only',
}

function useSpeechRecognition(onResult) {
  const recognitionRef = useRef(null)
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setSupported(false)
      return
    }
    setSupported(true)
    const recognition = new SpeechRecognition()
    recognition.lang = 'es-ES'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript
      if (transcript) onResult(transcript)
      setListening(false)
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    return () => recognition.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = useCallback(() => {
    if (!recognitionRef.current || listening) return
    try {
      recognitionRef.current.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }, [listening])

  return { supported, listening, start }
}

export default function Quiz() {
  const [phase, setPhase] = useState('loading-queue')
  const [queue, setQueue] = useState([])
  const [index, setIndex] = useState(0)
  const [isPracticeAhead, setIsPracticeAhead] = useState(false)
  const [cloze, setCloze] = useState(null)
  const [answer, setAnswer] = useState('')
  const [usedHint, setUsedHint] = useState(false)
  const [hintMessage, setHintMessage] = useState('')
  const [feedback, setFeedback] = useState(null) // { correct: bool, correctAnswer: string }
  const [error, setError] = useState('')
  const [summary, setSummary] = useState({ correct: 0, total: 0 })
  const difficulty = getDefaultDifficulty()

  const { supported: voiceSupported, listening, start: startListening } = useSpeechRecognition((text) => {
    setAnswer(text)
  })

  useEffect(() => {
    loadQueue()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  }, [])

  async function loadQueue() {
    setPhase('loading-queue')
    const due = await getDueWords(15)
    if (due.length > 0) {
      setQueue(due)
      setIsPracticeAhead(false)
      setIndex(0)
      setSummary({ correct: 0, total: 0 })
      loadQuestion(due[0])
      return
    }
    const practice = await getPracticeAheadWords(15)
    if (practice.length === 0) {
      setPhase('no-words')
      return
    }
    setQueue(practice)
    setIsPracticeAhead(true)
    setIndex(0)
    setSummary({ correct: 0, total: 0 })
    loadQuestion(practice[0])
  }

  async function loadQuestion(word) {
    setPhase('loading-question')
    setAnswer('')
    setUsedHint(false)
    setHintMessage('')
    setFeedback(null)
    setError('')
    try {
      const result = await generateClozeSentence(word.spanishWord, word.translation, difficulty)
      setCloze(result)
      setPhase('question')
    } catch (err) {
      setError(err instanceof GeminiError ? err.message : 'Could not generate a quiz question.')
      setPhase('error')
    }
  }

  const currentWord = queue[index]

  async function recordResult(correct, usedHintFlag) {
    const newSrs = applySm2(currentWord.srs, { correct, usedHint: usedHintFlag })
    await updateWord(currentWord.id, { srs: newSrs })
    setSummary((s) => ({ correct: s.correct + (correct && !usedHintFlag ? 1 : 0), total: s.total + 1 }))
  }

  async function handleMultipleChoice(option) {
    if (feedback) return
    const correct = isExactMatch(option, cloze.answer)
    setFeedback({ correct, correctAnswer: cloze.answer, picked: option })
    await recordResult(correct, false)
  }

  async function handleSubmitTyped() {
    if (!answer.trim() || feedback) return

    if (isExactMatch(answer, cloze.answer)) {
      setFeedback({ correct: true, correctAnswer: cloze.answer })
      await recordResult(true, usedHint)
      return
    }

    if (!usedHint && isCloseMatch(answer, cloze.answer)) {
      setUsedHint(true)
      setHintMessage(hintForMismatch(answer, cloze.answer))
      return
    }

    // Wrong (or wrong again after a hint retry)
    setFeedback({ correct: false, correctAnswer: cloze.answer })
    await recordResult(false, usedHint)
  }

  function hintForMismatch(submitted, correct) {
    const a = normalize(submitted)
    const b = normalize(correct)
    if (a.length !== b.length) return 'Close — check the ending.'
    if (a.slice(0, 2) !== b.slice(0, 2)) return 'Close — check the beginning.'
    return 'Close — double check the spelling.'
  }

  function handleNext() {
    const nextIndex = index + 1
    if (nextIndex >= queue.length) {
      setPhase('done')
      return
    }
    setIndex(nextIndex)
    loadQuestion(queue[nextIndex])
  }

  if (phase === 'loading-queue') {
    return <div className="empty-state">Building your quiz…</div>
  }

  if (phase === 'no-words') {
    return (
      <div className="empty-state">
        No words to quiz yet. <br />
        <Link to="/">Add some content</Link> and tap words to build your word bank first.
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div>
        <h1 className="screen-title">Session complete</h1>
        <div className="card">
          <p style={{ fontSize: '1.3rem', fontWeight: 700 }}>
            {summary.correct} / {summary.total} correct
          </p>
          <p style={{ color: 'var(--text-muted)' }}>on the first try, no hints</p>
        </div>
        <button className="btn btn-primary btn-block" onClick={loadQueue} type="button">
          Quiz again
        </button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1 className="screen-title" style={{ marginBottom: 0 }}>
          {isPracticeAhead ? 'Practice ahead' : 'Review'}
        </h1>
        <span className="badge badge-learning">{DIFFICULTY_LABEL[difficulty]}</span>
      </div>
      <div className="quiz-progress">
        <div className="quiz-progress-fill" style={{ width: `${(index / queue.length) * 100}%` }} />
      </div>

      {phase === 'loading-question' && (
        <div className="empty-state">
          <span className="spinner" /> Generating question…
        </div>
      )}

      {phase === 'error' && (
        <div>
          <div className="error-banner">{error}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => loadQuestion(currentWord)} type="button">
              Retry
            </button>
            <button className="btn" onClick={handleNext} type="button">
              Skip word
            </button>
          </div>
        </div>
      )}

      {phase === 'question' && cloze && (
        <div>
          <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
            {currentWord.translation}
          </p>

          {difficulty !== 'hard' && (
            <p className="quiz-sentence">{renderBlankedSentence(cloze.blankedSentence)}</p>
          )}

          {difficulty === 'easy' ? (
            <div className="mc-options">
              {shuffledOptions(cloze).map((opt) => {
                const isPicked = feedback?.picked === opt
                const cls = feedback
                  ? isExactMatch(opt, cloze.answer)
                    ? 'correct'
                    : isPicked
                      ? 'incorrect'
                      : ''
                  : ''
                return (
                  <button
                    key={opt}
                    className={`btn mc-option ${cls}`}
                    onClick={() => handleMultipleChoice(opt)}
                    disabled={!!feedback}
                    type="button"
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          ) : (
            <div>
              <div className="field" style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmitTyped()}
                  placeholder="Escribe la palabra…"
                  disabled={!!feedback}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                {voiceSupported && !feedback && (
                  <button className="btn" onClick={startListening} type="button" aria-label="Speak answer">
                    {listening ? <span className="spinner" /> : '🎤'}
                  </button>
                )}
              </div>
              {hintMessage && !feedback && <div className="notice-banner">{hintMessage} Try once more.</div>}
              {!feedback && (
                <button className="btn btn-primary btn-block" onClick={handleSubmitTyped} type="button">
                  Submit
                </button>
              )}
            </div>
          )}

          {feedback && (
            <div className={feedback.correct ? 'notice-banner' : 'error-banner'} style={{ marginTop: 16 }}>
              {feedback.correct ? (usedHint ? 'Correct (after a hint).' : 'Correct!') : `Not quite — the answer was "${feedback.correctAnswer}".`}
              <div style={{ marginTop: 4, fontStyle: 'italic' }}>{cloze.sentence}</div>
            </div>
          )}

          {feedback && (
            <button className="btn btn-primary btn-block" onClick={handleNext} type="button">
              {index + 1 >= queue.length ? 'Finish' : 'Next'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function renderBlankedSentence(blankedSentence) {
  const blankPattern = /_{2,}/
  const match = blankedSentence.match(blankPattern)
  if (!match) return blankedSentence
  const [before, after] = blankedSentence.split(blankPattern)
  return (
    <>
      {before}
      <span className="quiz-blank">____</span>
      {after}
    </>
  )
}

function shuffledOptions(cloze) {
  const options = [cloze.answer, ...(cloze.distractors || [])].filter(Boolean)
  // Deterministic-ish shuffle per render is fine here; re-shuffling on every
  // render would flicker option order, so seed off the answer+sentence.
  const seed = (cloze.answer + cloze.sentence).length
  return [...options].sort((a, b) => ((a.length * seed) % 7) - ((b.length * seed) % 7))
}
