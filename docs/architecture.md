# Architecture

LinguaTales is intentionally simple:

- `server.js` serves the frontend, accepts uploads, stores voice samples, starts audiobook jobs, and proxies translation requests.
- `public/` contains a no-build frontend so the app can run on a basic Node server without extra infrastructure.
- `scripts/extract_book.py` handles `TXT`, `PDF`, and `EPUB` ingestion.
- `scripts/generate_audiobook.py` runs the local Chatterbox generation flow and stitches chunked outputs into a single `wav`.
- `data/` stores uploaded voices, generated audio, and job metadata. It is git-ignored.

## Request flow

1. The browser sends pasted text or an uploaded file to `/api/book/extract`.
2. The server extracts the text, normalizes it, and returns chapter-like sections.
3. The user optionally records or uploads a voice sample to `/api/voice-sample`.
4. The browser starts a job with `/api/audiobook/generate`.
5. The server launches the Python generator and exposes progress through `/api/audiobook/status/:jobId`.
6. The browser plays the generated audio and highlights the approximate active word based on playback progress.

## Why this stack

- It is easy to run locally.
- It is easy to deploy to a Hetzner VM.
- It keeps the Chatterbox integration in Python, where that ecosystem is strongest.
- It avoids a heavy frontend build chain while still leaving room to migrate to React later if the product grows.
