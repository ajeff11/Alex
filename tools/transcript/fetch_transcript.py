#!/usr/bin/env python3
"""Fetch a YouTube video's transcript, printed as plain text (or saved to a file).

Runs entirely on your own machine — no API key, no OAuth, nothing to deploy.
That matters here specifically: youtube-transcript-api hits the same kind of
unofficial YouTube endpoints the rest of this project's own (JS, Vercel-hosted)
caption lookup does, and YouTube's bot-detection blocks those same requests
when they come from a cloud/datacenter IP (see RequestBlocked/IpBlocked
below — the library ships built-in proxy support for exactly that reason).
Running this locally instead, from your own residential IP, is what actually
sidesteps the block; it is not a difference in the library versus our JS code.

Usage:
    python3 fetch_transcript.py <youtube-url-or-video-id> [--lang es,en] [--timestamps] [-o out.txt]
"""
import argparse
import sys
from urllib.parse import urlparse, parse_qs

from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    CouldNotRetrieveTranscript,
    IpBlocked,
    NoTranscriptFound,
    RequestBlocked,
    TranscriptsDisabled,
    VideoUnavailable,
)

# Spanish first, by default, since this tool exists for Spanish-immersion
# use — but --lang overrides this with any comma-separated language list.
DEFAULT_LANGUAGES = ["es", "es-MX", "es-419"]

VIDEO_ID_LENGTH = 11


def is_video_id(candidate: str) -> bool:
    return len(candidate) == VIDEO_ID_LENGTH and all(c.isalnum() or c in "_-" for c in candidate)


def extract_video_id(url_or_id: str) -> str:
    """Pull an 11-character YouTube video ID out of a watch/youtu.be/shorts/
    embed URL, or pass a bare video ID straight through. Mirrors the parsing
    rules in src/utils/youtube.js so both tools agree on what counts as a
    valid link."""
    candidate = url_or_id.strip()
    if is_video_id(candidate):
        return candidate

    parsed = urlparse(candidate if "//" in candidate else f"https://{candidate}")
    host = parsed.netloc.lower()

    if host == "youtu.be":
        video_id = parsed.path.lstrip("/").split("/")[0]
        if is_video_id(video_id):
            return video_id
    elif host.endswith("youtube.com"):
        if parsed.path == "/watch":
            video_id = parse_qs(parsed.query).get("v", [None])[0]
            if video_id and is_video_id(video_id):
                return video_id
        else:
            for prefix in ("/shorts/", "/embed/"):
                if parsed.path.startswith(prefix):
                    video_id = parsed.path[len(prefix):].split("/")[0]
                    if is_video_id(video_id):
                        return video_id

    raise ValueError(f"could not find a YouTube video ID in {url_or_id!r}")


def pick_transcript(transcript_list, languages):
    """Prefer a manually created transcript over an auto-generated one,
    within the given language preference order. If none of the requested
    languages have ANY transcript, fall back to whatever IS available,
    still preferring manual over auto-generated — so the tool always
    returns something usable when something exists, and the caller can see
    from the returned Transcript exactly what it got."""
    try:
        return transcript_list.find_manually_created_transcript(languages)
    except NoTranscriptFound:
        pass
    try:
        return transcript_list.find_generated_transcript(languages)
    except NoTranscriptFound:
        pass

    available = list(transcript_list)
    if not available:
        raise NoTranscriptFound(transcript_list.video_id, languages, transcript_list)
    manual = [t for t in available if not t.is_generated]
    return (manual or available)[0]


def format_transcript(fetched, with_timestamps: bool) -> str:
    lines = []
    for snippet in fetched:
        if with_timestamps:
            minutes, seconds = divmod(int(snippet.start), 60)
            lines.append(f"[{minutes:02d}:{seconds:02d}] {snippet.text}")
        else:
            lines.append(snippet.text)
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Fetch a YouTube video's transcript. Runs locally — no API key needed."
    )
    parser.add_argument("url", help="YouTube video URL (watch, youtu.be, or shorts) or a bare video ID")
    parser.add_argument(
        "--lang",
        default=",".join(DEFAULT_LANGUAGES),
        help=f"Comma-separated language preference, most preferred first (default: {','.join(DEFAULT_LANGUAGES)})",
    )
    parser.add_argument("--timestamps", action="store_true", help="Prefix each line with [MM:SS]")
    parser.add_argument("-o", "--output", help="Write to this file instead of printing to stdout")
    args = parser.parse_args()

    languages = [code.strip() for code in args.lang.split(",") if code.strip()]

    try:
        video_id = extract_video_id(args.url)
    except ValueError as err:
        print(f"Error: {err}.", file=sys.stderr)
        sys.exit(1)

    api = YouTubeTranscriptApi()

    try:
        transcript_list = api.list(video_id)
        transcript = pick_transcript(transcript_list, languages)
        fetched = transcript.fetch()
    except (TranscriptsDisabled, NoTranscriptFound):
        print(f"Error: no captions are available for this video (video ID: {video_id}).", file=sys.stderr)
        sys.exit(1)
    except VideoUnavailable:
        print(
            f"Error: this video is private, removed, or otherwise unavailable (video ID: {video_id}).",
            file=sys.stderr,
        )
        sys.exit(1)
    except IpBlocked:
        print(
            "Error: YouTube blocked this request from your IP address. This can happen even from a "
            "home connection occasionally — wait a bit and try again. If it keeps happening, "
            "youtube-transcript-api supports routing through a proxy (WebshareProxyConfig) — see its "
            "docs: https://github.com/jdepoix/youtube-transcript-api",
            file=sys.stderr,
        )
        sys.exit(1)
    except RequestBlocked:
        print(
            "Error: YouTube blocked this request (rate limiting or bot detection). Wait a bit and try again.",
            file=sys.stderr,
        )
        sys.exit(1)
    except CouldNotRetrieveTranscript as err:
        print(f"Error: could not retrieve the transcript — {err}", file=sys.stderr)
        sys.exit(1)
    except Exception as err:  # network failures, DNS issues, etc. — not library-specific
        print(f"Error: unexpected failure talking to YouTube — {err}", file=sys.stderr)
        sys.exit(1)

    kind = "auto-generated" if transcript.is_generated else "manually created"
    print(f'Using {kind} "{transcript.language}" ({transcript.language_code}) track.', file=sys.stderr)

    text = format_transcript(fetched, args.timestamps)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text + "\n")
        print(f"Saved to {args.output}", file=sys.stderr)
    else:
        print(text)


if __name__ == "__main__":
    main()
