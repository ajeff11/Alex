# Immersión — Spanish Immersion Learning PWA

A personal-use Progressive Web App for Spanish immersion learning. Paste a
YouTube link or podcast audio URL, get a transcript, tap unfamiliar words for
contextual English translations, and drill saved words with a proper SM-2
spaced-repetition quiz.

Single-user, no login, no backend database — all data lives in your browser
(IndexedDB), with manual JSON export/import as backup.

## Stack

- React + Vite, built as an installable PWA (`vite-plugin-pwa`)
- IndexedDB via Dexie.js for the word bank and transcripts
- `localStorage` for settings (API key, default quiz difficulty)
- Vercel serverless functions (`/api/*`) for the one thing that can't run
  client-side: fetching YouTube captions and proxying/uploading audio to
  Gemini (both hit CORS in-browser)
- Google Gemini API (Flash models, free tier) for transcription, contextual
  translation, and quiz sentence generation — see `src/services/gemini.js`

## Local development

```bash
npm install
npm run dev
```

Open the printed local URL, then go to **Settings** and paste a Gemini API
key (free at [Google AI Studio](https://aistudio.google.com/apikey)). Nothing
works without it.

The `/api/*` routes are Vercel serverless functions. `npm run dev` (plain
Vite) does **not** serve them — use the Vercel CLI for full local parity:

```bash
npm install -g vercel
vercel dev
```

## Deploying to Vercel

```bash
vercel
```

Vercel auto-detects the Vite framework and the `api/` folder. No environment
variables are required server-side — the Gemini API key is supplied by the
client on each request that needs it (podcast/YouTube-audio transcription
uploads) and is otherwise used directly from the browser (translation, quiz
generation). It is never stored on the server.

## Installing on iPhone

Open the deployed URL in Safari → Share → **Add to Home Screen**. The app
then runs standalone, matching the manifest's `display: standalone`.

## Known constraints

- **iOS Safari can clear PWA storage after long inactivity.** Export a
  backup from Settings or the Word Bank screen periodically — this is not
  optional.
- **Voice input** (Web Speech API) is best-effort and unreliable on iOS
  Safari; the mic button only appears when the browser reports support.
- **YouTube caption fetching is unofficial** (`api/youtube-transcript.js`
  scrapes `ytInitialPlayerResponse` and the public `timedtext` endpoint).
  It can break without notice. When it does, or when a video has no Spanish
  captions, the app automatically falls back to Gemini audio transcription.
- **Gemini's free tier has daily quotas.** A 429 shows a clear in-app
  message rather than failing silently.

## Data model

See `src/db/wordBank.js` and `src/db/sessions.js` for the `WordBankItem` and
`TranscriptSession` shapes, and `src/utils/srs.js` for the SM-2
implementation.
