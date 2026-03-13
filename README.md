# LinguaTales

LinguaTales is a local-first audiobook web app: paste text or upload a `PDF` / `EPUB`, record a voice sample in the browser, generate an audiobook with Chatterbox, and read along in a rich reader with instant inline translation.

## Stack

- Node.js + Express for the web server and API
- Plain HTML, CSS, and vanilla JS for a low-friction frontend
- Python helper scripts for PDF / EPUB extraction and Chatterbox generation
- `ffmpeg` for stitching generated audio chunks into one audiobook file

## Features

- Beautiful landing + reader experience optimized for desktop and mobile
- Text paste, `PDF`, `EPUB`, and `TXT` ingestion
- In-browser voice recording and audio sample upload
- Chatterbox-ready audiobook generation pipeline with expressive controls
- Soft word-by-word highlighting during playback
- Click-to-translate words and selection-based phrase translation
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

- `scripts/requirements.txt` installs the core parsing dependencies and works well for local setup.
- Real Chatterbox generation is optional and lives in [scripts/requirements-chatterbox.txt](/Users/andre/LinguaTales/scripts/requirements-chatterbox.txt).
- `chatterbox-tts` may download model weights the first time you generate audio.
- CPU mode works, but a CUDA GPU is much better for long books.
- `ffmpeg` must be available on your `PATH`.

Optional Chatterbox install:

```bash
pip install -r scripts/requirements-chatterbox.txt
```

Platform note:

- On Intel macOS, official PyTorch wheels do not currently line up with the Chatterbox package pins, so LinguaTales automatically falls back to the built-in macOS `say` voices for local UX testing.
- For real Chatterbox generation, use Linux or Apple Silicon and point `PYTHON_BIN` at that compatible environment.

### 3. Configure environment

```bash
cp .env.example .env
```

Optional variables:

- `LIBRETRANSLATE_URL` if you want to use your own LibreTranslate instance
- `LIBRETRANSLATE_API_KEY` if your LibreTranslate instance requires one
- `DEFAULT_TRANSLATION_PROVIDER=mymemory` to fall back to the free MyMemory API

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

## Notes about translation

- Word and phrase translation is wired to free services by default.
- For production, self-hosting LibreTranslate is a better path than depending on public rate-limited endpoints.

## Notes about Chatterbox

This project uses the official Python package interface from Resemble AI's Chatterbox repository. The generation script targets `ChatterboxMultilingualTTS`, which supports Portuguese as `pt`, and falls back to a macOS demo voice only when the host machine cannot install the official Chatterbox runtime.

For more dramatic delivery, the controls in the UI map to:

- `Emotion exaggeration`
- `CFG weight` for slower or more deliberate pacing

Those settings mirror the guidance in the official project for expressive narration.
