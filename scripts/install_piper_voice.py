#!/usr/bin/env python3

from __future__ import annotations

import argparse
import shutil
import unicodedata
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen

DEFAULT_VOICE_ID = "pt_PT-tugão-medium"
DEFAULT_DOWNLOAD_DIR = Path("data/piper/voices")
URL_FORMAT = (
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/"
    "{lang_family}/{lang_code}/{voice_name}/{voice_quality}/{voice_id}{extension}?download=true"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice-id", default=DEFAULT_VOICE_ID)
    parser.add_argument("--download-dir", default=str(DEFAULT_DOWNLOAD_DIR))
    parser.add_argument("--model-path", default="")
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def sanitize_voice_filename(voice_id: str) -> str:
    normalized = unicodedata.normalize("NFKD", voice_id)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    safe = "".join(character if character.isalnum() or character in {"-", "_"} else "-" for character in ascii_only)
    return safe.strip("-") or "piper-voice"


def default_model_path(download_dir: Path, voice_id: str) -> Path:
    return download_dir / f"{sanitize_voice_filename(voice_id)}.onnx"


def build_voice_urls(voice_id: str) -> tuple[str, str]:
    lang_family, remainder = voice_id.split("_", 1)
    lang_region, voice_name, voice_quality = remainder.split("-", 2)
    lang_code = f"{lang_family}_{lang_region}"
    format_args = {
        "lang_family": quote(lang_family),
        "lang_code": quote(lang_code),
        "voice_name": quote(voice_name),
        "voice_quality": quote(voice_quality),
        "voice_id": quote(voice_id),
    }
    model_url = URL_FORMAT.format(extension=".onnx", **format_args)
    config_url = URL_FORMAT.format(extension=".onnx.json", **format_args)
    return model_url, config_url


def ensure_voice_downloaded(
    voice_id: str = DEFAULT_VOICE_ID,
    download_dir: Path | str = DEFAULT_DOWNLOAD_DIR,
    model_path: Path | str | None = None,
    force: bool = False,
) -> Path:
    download_dir = Path(download_dir)
    download_dir.mkdir(parents=True, exist_ok=True)
    target_model_path = Path(model_path) if model_path else default_model_path(download_dir, voice_id)
    target_model_path.parent.mkdir(parents=True, exist_ok=True)
    target_config_path = Path(f"{target_model_path}.json")

    model_url, config_url = build_voice_urls(voice_id)

    if force or not _is_downloaded(target_model_path):
        _download_to_path(model_url, target_model_path)
    if force or not _is_downloaded(target_config_path):
        _download_to_path(config_url, target_config_path)

    return target_model_path


def _is_downloaded(path: Path) -> bool:
    return path.exists() and path.stat().st_size > 0


def _download_to_path(url: str, output_path: Path) -> None:
    with urlopen(url) as response:
        with output_path.open("wb") as output_file:
            shutil.copyfileobj(response, output_file)


def main() -> None:
    args = parse_args()
    model_path = ensure_voice_downloaded(
        voice_id=args.voice_id,
        download_dir=args.download_dir,
        model_path=args.model_path or None,
        force=args.force,
    )
    print(model_path)


if __name__ == "__main__":
    main()
