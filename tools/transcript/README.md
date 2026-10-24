# YouTube transcript fetcher (local tool)

A standalone script — **not** part of the deployed app. Runs on your own
computer so it uses your own (residential) IP, which is what actually avoids
YouTube's bot-detection; running the same request from Vercel (or any cloud
host) hits the same wall the app's own caption lookup does.

## Setup

```bash
cd tools/transcript
python3 -m venv .venv && source .venv/bin/activate   # optional but recommended
pip install -r requirements.txt
```

## Usage

```bash
python3 fetch_transcript.py "https://www.youtube.com/watch?v=VIDEO_ID"
python3 fetch_transcript.py "https://youtu.be/VIDEO_ID" --timestamps
python3 fetch_transcript.py "https://www.youtube.com/shorts/VIDEO_ID" --lang en,es -o transcript.txt
```

- Accepts `youtube.com/watch?v=`, `youtu.be/`, `/shorts/`, `/embed/` links, or a bare 11-character video ID.
- Default language preference is Spanish (`es`, `es-MX`, `es-419`); override with `--lang` (comma-separated, most preferred first).
- Prefers a manually created caption track over an auto-generated one, within whichever language it ends up using. If none of your preferred languages have captions at all, it falls back to whatever language *is* available (still manual-over-auto-generated) rather than failing outright.
- Always prints which track it used (language + manual/auto-generated) to stderr, so stdout stays clean transcript text you can pipe or redirect.
- `--timestamps` prefixes each line with `[MM:SS]`; without it, output is plain text, one line per caption snippet.
- `-o file.txt` saves to a file instead of printing.

## Errors

No captions, a private/removed video, and YouTube blocking the request each print a distinct, clear message to stderr and exit non-zero — nothing surfaces as a raw traceback.
