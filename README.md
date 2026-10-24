# Immersión — Spanish Immersion Learning PWA

A personal-use Progressive Web App for Spanish immersion learning. Paste a
YouTube link or podcast audio URL, get a transcript, tap unfamiliar words for
contextual English translations, and drill saved words with a proper SM-2
spaced-repetition quiz.

Single-user, no login, no backend database — all data lives in your browser
(IndexedDB), with manual JSON export/import as backup.

**Live app:** https://alex-five-kappa.vercel.app/

## Stack

- React + Vite, built as an installable PWA (`vite-plugin-pwa`)
- IndexedDB via Dexie.js for the word bank and transcripts
- `localStorage` for settings (API key, default quiz difficulty)
- Vercel serverless functions (`/api/*`) for the two things that can't run
  client-side: fetching YouTube caption metadata, and proxying/uploading
  podcast audio to Gemini (both hit CORS in-browser)
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
client on each request that needs it (podcast audio uploads) and is
otherwise used directly from the browser (translation, quiz generation,
YouTube transcription). It is never stored on the server.

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
  calls YouTube's InnerTube `player` JSON endpoint, then the public
  `timedtext` endpoint). It can break without notice, and — since it's a
  request from Vercel's datacenter IPs — can also get challenged by
  YouTube's bot detection even when the video genuinely has captions.
- **When captions aren't found, the app asks Gemini to transcribe the
  YouTube video directly by URL** (`transcribeYoutubeUrl` in
  `src/services/gemini.js`) rather than downloading the video ourselves.
  Gemini's own servers fetch it, which sidesteps the datacenter-IP blocking
  problem entirely — a prior version of this app tried extracting audio via
  `ytdl-core` instead and ran straight into that wall with no reliable fix.
  The tradeoff: Gemini ingests the whole video (as video, not audio-only),
  so token usage — and therefore free-tier quota use — scales with video
  length. Prefer captioned videos or direct podcast URLs when possible;
  they're free and instant by comparison.
- **Gemini's free tier has daily quotas.** A 429 shows a clear in-app
  message rather than failing silently.

## Data model

See `src/db/wordBank.js` and `src/db/sessions.js` for the `WordBankItem` and
`TranscriptSession` shapes, and `src/utils/srs.js` for the SM-2
implementation.
