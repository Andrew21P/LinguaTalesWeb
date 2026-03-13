# Architecture

Voxenor is intentionally simple:

- `server.js` serves the frontend, handles the lightweight password gate, stores saved books and voice samples, prepares page audio, and proxies translation requests.
- `public/` contains a no-build frontend so the app can run on a basic Node server without extra infrastructure.
- `scripts/extract_book.py` handles `TXT`, `PDF`, and `EPUB` ingestion.
- `scripts/extract_cover.py` builds saved library covers from books when possible.
- `scripts/translate_text.py` runs the stronger free translation path used for saved book pages.
- `scripts/generate_audiobook.py` runs the local Chatterbox generation flow and stitches chunked outputs into a single `wav`.
- `data/` stores uploaded voices, saved books, generated page audio, preferences, and job metadata. It is git-ignored.

## Request flow

1. The browser signs into the lightweight local session and loads saved preferences through `/api/session` and `/api/meta`.
2. The user imports pasted text or an uploaded file through `/api/books/import`.
3. The server extracts the text, saves the original into the local library, paginates it, and creates a cover when possible.
4. The browser opens a saved page through `/api/books/:bookId/pages/:pageIndex`.
5. When the reader starts listening, `/api/books/:bookId/pages/:pageIndex/prepare` translates that page to PT-PT if needed, generates its audio, and prefetches the next page in the background.
6. The browser plays the saved page audio, highlights the active words, auto-advances when the next page is ready, and persists progress with `/api/books/:bookId/progress`.

## Why this stack

- It is easy to run locally.
- It is easy to deploy to a Hetzner VM.
- It keeps the Chatterbox integration in Python, where that ecosystem is strongest.
- It avoids a heavy frontend build chain while still leaving room to migrate to React later if the product grows.
