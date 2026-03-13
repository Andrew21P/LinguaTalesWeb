# LinguaTales

LinguaTales is a local-first audiobook web app: paste text or upload a `PDF`, `EPUB`, `TXT`, or book-page photo, record a voice sample in the browser, generate an audiobook with Chatterbox, and read along in a rich reader with inline translation.

## Stack

- Node.js + Express for the web server and API
- Plain HTML, CSS, and vanilla JS for a low-friction frontend
- Python helper scripts for OCR, extraction, language detection, and Chatterbox generation
- `ffmpeg` for stitching and mastering generated audio chunks into one audiobook file

## Features

- Emerald reader experience optimized for desktop and mobile
- Text paste, `PDF`, `EPUB`, `TXT`, and image ingestion
- OCR for scanned pages and book photos with free local tooling
- In-browser voice recording and audio sample upload
- PT-PT-first audiobook generation pipeline with source-language detection, optional translation, and PT-BR to PT-PT phrasing normalization before narration
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
- `DEFAULT_TRANSLATION_PROVIDER=mymemory` to fall back to the free MyMemory API
- `DEFAULT_EXAGGERATION=0.58` if you want to tune the fixed narration expressiveness default

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
- Books can still come from other languages. The app can detect the source language, translate into Portuguese when needed, and normalize PT-BR phrasing toward PT-PT before narration.
- The listener language is separate from the audiobook language so inline translations can stay personalized.

## Notes about translation

- Small phrase translation is wired to free services by default.
- Whole-book translation is also supported, but quality and reliability are best when you self-host LibreTranslate.
- The public MyMemory fallback is convenient for testing, but it is not ideal for long books.

## Notes about OCR

- Image OCR and scanned-page OCR are handled locally with `tesseract`, `pytesseract`, and `PyMuPDF`.
- OCR quality is best with straight pages, good lighting, and high-resolution photos.

## Notes about Chatterbox

This project uses the official Python package interface from Resemble AI's Chatterbox repository. The generation script targets `ChatterboxMultilingualTTS`, which supports Portuguese as `pt`, and falls back to a macOS demo voice only when the host machine cannot install the official Chatterbox runtime.

LinguaTales now keeps expressiveness fixed in the product and nudges it slightly more lively by default, while also running a light mastering chain after synthesis for a cleaner final export.
