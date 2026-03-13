# Voxenor

Voxenor is a local-first audiobook library: import a `PDF`, `EPUB`, `TXT`, or book-page photo, save it into a private local shelf, record a voice sample in the browser, translate page by page into PT-PT, and read along with saved progress and inline translation.

## Stack

- Node.js + Express for the web server and API
- Plain HTML, CSS, and vanilla JS for a low-friction frontend
- Python helper scripts for OCR, extraction, language detection, and Chatterbox generation
- `ffmpeg` for stitching and mastering generated audio chunks into one audiobook file

## Features

- Emerald reader experience optimized for desktop and mobile
- Text paste, `PDF`, `EPUB`, `TXT`, and image ingestion
- OCR for scanned pages and book photos with free local tooling
- Password-gated local session with cached sign-in
- Saved library with progress, per-page text, and resumable audio
- In-browser voice recording and audio sample upload
- Named custom voice samples with in-app delete controls
- PT-PT-first audiobook generation pipeline with source-language detection, stronger free translation, and warm-model reuse for faster repeat generations
- Smoother playback highlighting driven by narration alignment metadata
- Click-to-translate words and selection-based phrase translation
- Audio mastering after synthesis for a cleaner, crisper final export
- Localhost friendly and simple to deploy on a Hetzner VM

## Repository guide

- [server.js](/Users/andre/LinguaTales/server.js): API and static hosting
- [public/index.html](/Users/andre/LinguaTales/public/index.html): single-page shell
- [public/styles.css](/Users/andre/LinguaTales/public/styles.css): visual system and responsive layout
- [public/app.js](/Users/andre/LinguaTales/public/app.js): reader interactions, recording, playback, translation
- [scripts/extract_book.py](/Users/andre/LinguaTales/scripts/extract_book.py): file text extraction
- [scripts/generate_audiobook.py](/Users/andre/LinguaTales/scripts/generate_audiobook.py): Chatterbox generation wrapper
- [docs/architecture.md](/Users/andre/LinguaTales/docs/architecture.md): project structure and request flow
- [docs/hosting-hetzner.md](/Users/andre/LinguaTales/docs/hosting-hetzner.md): hosting notes for Hetzner

## Local setup

### 1. Install Node dependencies

```bash
npm install
```

### 2. Install Python dependencies

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/requirements.txt
```

Notes:

- `scripts/requirements.txt` installs the parsing, OCR, and language-detection dependencies used by the extraction pipeline.
- Real Chatterbox generation is optional and lives in [scripts/requirements-chatterbox.txt](/Users/andre/LinguaTales/scripts/requirements-chatterbox.txt).
- `chatterbox-tts` may download model weights the first time you generate audio.
- CPU mode works, but a CUDA GPU is much better for long books.
- `ffmpeg` must be available on your `PATH`.
- `tesseract` should be available on your `PATH` if you want OCR from photos or scanned pages.
- Browser-recorded voice prompts are normalized to mono `wav` automatically before cloning so Chatterbox gets a stable prompt format.
- If cleanup trims a recording too aggressively, Voxenor retries a safer prompt-normalization path and rejects truly unusable samples before generation.

Optional Chatterbox install:

```bash
pip install -r scripts/requirements-chatterbox.txt
```

Platform note:

- On Apple Silicon Macs, make sure your Python itself is arm64 as well. If your shell is arm64 but your Python comes from an old `/usr/local` x86 Homebrew install, Chatterbox will still fail.
- The project works well with an arm64 Python 3.11 environment and `PYTHON_BIN` pointed at that interpreter.
- `LINGUATALES_ENABLE_SAY_FALLBACK=0` by default now, so the app will not silently fake narration with macOS voices when Chatterbox is unavailable.

### 3. Configure environment

```bash
cp .env.example .env
```

Optional variables:

- `LIBRETRANSLATE_URL` if you want to use your own LibreTranslate instance
- `LIBRETRANSLATE_API_KEY` if your LibreTranslate instance requires one
- `DEFAULT_TRANSLATION_PROVIDER=google-web` to use the stronger free web translator path by default
- `DEFAULT_EXAGGERATION=0.52` if you want to tune the fixed narration expressiveness default
- `DEFAULT_NARRATION_SPEED=0.95` if you want to tune the default rendered narration tempo
- `DEFAULT_CFG_WEIGHT=0.28` if you want a slightly calmer multilingual Chatterbox guidance setting
- `READY_PAGE_WINDOW=3` if you want Voxenor to keep more or fewer upcoming pages warming in the background
- `MIN_VOICE_PROMPT_SECONDS=2.4` if you want to tune the minimum accepted cleaned voice-sample length
- `APP_ACCOUNT_*` values if you want to change the temporary local account and profile preferences

### 4. Run the app

```bash
npm start
```

Open `http://localhost:3000`.

## Hetzner deployment

This app is intentionally simple to host:

1. Provision a small Ubuntu server on Hetzner.
2. Install Node.js 20+, Python 3.11+, `ffmpeg`, and optionally CUDA if you want faster Chatterbox generation.
3. Clone the repo, create a Python virtualenv, install `npm` and `pip` dependencies, then run `npm start`.
4. Put Nginx in front of the Node process and use a `systemd` service for persistence.

A starter `systemd` unit is included at [deploy/linguatales.service](/Users/andre/LinguaTales/deploy/linguatales.service).
More deployment notes live in [docs/hosting-hetzner.md](/Users/andre/LinguaTales/docs/hosting-hetzner.md).

## Language support

- Fully supported narration target right now: `Portuguese (Portugal)`.
- Books can still come from other languages, including `Russian` and `Ukrainian`. The app can detect the source language and translate into Portuguese when needed.
- The listener language is separate from the audiobook language so inline translations can stay personalized.

## Notes about translation

- Small phrase translation is wired to free services by default.
- Saved-book page translation now prefers the stronger free Google web path and normalizes results toward PT-PT wording.
- Self-hosted LibreTranslate still takes priority if you configure it.

## Notes about OCR

- Image OCR and scanned-page OCR are handled locally with `tesseract`, `pytesseract`, and `PyMuPDF`.
- OCR quality is best with straight pages, good lighting, and high-resolution photos.

## Notes about Chatterbox

This project uses the official Python package interface from Resemble AI's Chatterbox repository. The generation script targets `ChatterboxMultilingualTTS`, which supports Portuguese as `pt`, and falls back to a macOS demo voice only when the host machine cannot install the official Chatterbox runtime.

Voxenor keeps expressiveness fixed in the product, renders the final narration slightly slower by default, reuses a warm local Chatterbox worker to avoid repeated model loads, and runs a brighter mastering chain after synthesis for a cleaner final export.
