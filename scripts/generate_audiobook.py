#!/usr/bin/env python3

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--language", default="pt")
    parser.add_argument("--voice-sample", default="")
    parser.add_argument("--exaggeration", type=float, default=0.7)
    parser.add_argument("--cfg-weight", type=float, default=0.3)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    text = input_path.read_text(encoding="utf-8")
    chunks = split_text(text)

    print("PROGRESS:10|Loading Chatterbox models.", flush=True)

    try:
        import torch
        import torchaudio as ta
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    except ImportError:
        if can_use_say_fallback():
            generate_with_say_fallback(args, chunks, output_path)
            print("PROGRESS:100|Audiobook finished with macOS demo voice fallback.", flush=True)
            return

        raise SystemExit(
            "Chatterbox is not installed yet. Install the optional stack from scripts/requirements-chatterbox.txt on Linux or Apple Silicon, or use macOS for the built-in demo fallback."
        )

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = ChatterboxMultilingualTTS.from_pretrained(device=device)

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_dir_path = Path(temp_dir)
        part_paths = []

        for index, chunk in enumerate(chunks):
            progress = 15 + int((index / max(len(chunks), 1)) * 75)
            print(f"PROGRESS:{progress}|Generating chunk {index + 1} of {len(chunks)}.", flush=True)

            kwargs = {
                "language_id": args.language,
                "exaggeration": args.exaggeration,
                "cfg_weight": args.cfg_weight,
            }
            if args.voice_sample:
                kwargs["audio_prompt_path"] = args.voice_sample

            wav = model.generate(chunk, **kwargs)
            part_path = temp_dir_path / f"chunk-{index:04d}.wav"
            ta.save(str(part_path), wav, model.sr)
            part_paths.append(part_path)

        print("PROGRESS:92|Combining narration chunks.", flush=True)
        combine_wavs(part_paths, output_path)

    print("PROGRESS:100|Audiobook finished.", flush=True)


def split_text(text: str, max_chars: int = 900) -> list[str]:
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        raise SystemExit("The provided text is empty.")

    sentences = re.split(r"(?<=[.!?])\s+", normalized)
    chunks: list[str] = []
    current = ""

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue

        if len(sentence) > max_chars:
            parts = wrap_long_sentence(sentence, max_chars)
        else:
            parts = [sentence]

        for part in parts:
            if not current:
                current = part
                continue

            if len(current) + 1 + len(part) <= max_chars:
                current = f"{current} {part}"
            else:
                chunks.append(current)
                current = part

    if current:
        chunks.append(current)

    return chunks


def wrap_long_sentence(sentence: str, max_chars: int) -> list[str]:
    words = sentence.split()
    parts: list[str] = []
    current = ""

    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) <= max_chars:
            current = candidate
        else:
            if current:
                parts.append(current)
            current = word

    if current:
        parts.append(current)

    return parts


def combine_wavs(part_paths: list[Path], output_path: Path) -> None:
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".txt") as list_file:
        list_path = Path(list_file.name)
        for part_path in part_paths:
            list_file.write(f"file '{part_path.as_posix()}'\n")

    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(list_path),
                "-c",
                "copy",
                str(output_path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise SystemExit(result.stderr.strip() or "ffmpeg failed while combining audiobook chunks.")
    finally:
        list_path.unlink(missing_ok=True)


def can_use_say_fallback() -> bool:
    if os.getenv("LINGUATALES_DISABLE_SAY_FALLBACK") == "1":
        return False
    return os.uname().sysname == "Darwin" and shutil.which("say") is not None


def generate_with_say_fallback(args: argparse.Namespace, chunks: list[str], output_path: Path) -> None:
    say_voice = select_macos_voice(args.language)
    rate = select_macos_rate(args.cfg_weight)

    if args.voice_sample:
        print(
            "PROGRESS:12|Custom voice cloning is unavailable in macOS demo fallback mode; using a system narration voice instead.",
            flush=True,
        )
    else:
        print("PROGRESS:12|Chatterbox unavailable on this machine; using a macOS demo narration voice.", flush=True)

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_dir_path = Path(temp_dir)
        part_paths = []

        for index, chunk in enumerate(chunks):
            progress = 18 + int((index / max(len(chunks), 1)) * 70)
            print(f"PROGRESS:{progress}|Generating fallback chunk {index + 1} of {len(chunks)}.", flush=True)

            text_path = temp_dir_path / f"chunk-{index:04d}.txt"
            part_path = temp_dir_path / f"chunk-{index:04d}.wav"
            text_path.write_text(chunk, encoding="utf-8")

            command = [
                "say",
                "-v",
                say_voice,
                "-r",
                str(rate),
                "-f",
                str(text_path),
                "-o",
                str(part_path),
                "--file-format=WAVE",
                "--data-format=LEI16@22050",
            ]
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            if result.returncode != 0:
                raise SystemExit(result.stderr.strip() or "macOS say failed during fallback generation.")

            part_paths.append(part_path)

        print("PROGRESS:92|Combining narration chunks.", flush=True)
        combine_wavs(part_paths, output_path)


def select_macos_voice(language: str) -> str:
    voice_map = {
        "pt": "Joana",
        "en": "Daniel",
        "es": "Mónica",
        "fr": "Thomas",
        "de": "Anna",
        "it": "Alice",
        "nl": "Ellen",
        "ja": "Kyoko",
    }
    return voice_map.get(language, "Daniel")


def select_macos_rate(cfg_weight: float) -> int:
    return max(130, min(210, int(185 - (cfg_weight * 40))))


if __name__ == "__main__":
    main()
