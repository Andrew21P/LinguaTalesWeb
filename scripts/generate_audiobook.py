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
        from chatterbox import mtl_tts as cb_mtl
    except ImportError:
        if can_use_say_fallback():
            generate_with_say_fallback(args, chunks, output_path)
            print("PROGRESS:100|Audiobook finished with macOS demo voice fallback.", flush=True)
            return

        raise SystemExit(
            "Chatterbox is not installed yet. Install the optional stack from scripts/requirements-chatterbox.txt on Linux or Apple Silicon, or use macOS for the built-in demo fallback."
        )

    device = resolve_device(torch)
    print(f"PROGRESS:12|Using the official Chatterbox multilingual model on {device}.", flush=True)
    model = load_multilingual_model(cb_mtl, torch, device)

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
                if index == 0:
                    print("PROGRESS:14|Applying your uploaded voice sample as the prompt voice.", flush=True)
                kwargs["audio_prompt_path"] = args.voice_sample

            wav = model.generate(chunk, **kwargs)
            part_path = temp_dir_path / f"chunk-{index:04d}.wav"
            ta.save(str(part_path), wav, model.sr)
            part_paths.append(part_path)

        print("PROGRESS:92|Combining narration chunks.", flush=True)
        combine_wavs(part_paths, output_path)

    print("PROGRESS:100|Audiobook finished.", flush=True)


def resolve_device(torch_module) -> str:
    if torch_module.cuda.is_available():
        return "cuda"
    if getattr(torch_module.backends, "mps", None) and torch_module.backends.mps.is_available():
        return "mps"
    return "cpu"


def load_multilingual_model(cb_mtl, torch_module, device: str):
    ckpt_dir = Path(
        cb_mtl.snapshot_download(
            repo_id=cb_mtl.REPO_ID,
            repo_type="model",
            revision="main",
            allow_patterns=[
                "ve.pt",
                "t3_mtl23ls_v2.safetensors",
                "s3gen.pt",
                "grapheme_mtl_merged_expanded_v1.json",
                "conds.pt",
                "Cangjie5_TC.json",
            ],
            token=os.getenv("HF_TOKEN"),
        )
    )

    # The official multilingual loader currently deserializes checkpoints without
    # a map_location, which crashes on Apple Silicon / CPU-only hosts when the
    # checkpoint tensors are tagged for CUDA. Load on CPU first, then move.
    map_location = torch_module.device("cpu") if device != "cuda" else None

    ve = cb_mtl.VoiceEncoder()
    ve.load_state_dict(
        torch_module.load(ckpt_dir / "ve.pt", map_location=map_location, weights_only=True)
    )
    ve.to(device).eval()

    t3 = cb_mtl.T3(cb_mtl.T3Config.multilingual())
    t3_state = cb_mtl.load_safetensors(ckpt_dir / "t3_mtl23ls_v2.safetensors")
    if "model" in t3_state.keys():
        t3_state = t3_state["model"][0]
    t3.load_state_dict(t3_state)
    t3.to(device).eval()

    s3gen = cb_mtl.S3Gen()
    s3gen.load_state_dict(
        torch_module.load(ckpt_dir / "s3gen.pt", map_location=map_location, weights_only=True)
    )
    s3gen.to(device).eval()

    tokenizer = cb_mtl.MTLTokenizer(str(ckpt_dir / "grapheme_mtl_merged_expanded_v1.json"))

    conds = None
    if (builtin_voice := ckpt_dir / "conds.pt").exists():
        conds = cb_mtl.Conditionals.load(builtin_voice, map_location=map_location).to(device)

    return cb_mtl.ChatterboxMultilingualTTS(t3, s3gen, ve, tokenizer, device, conds=conds)


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
    return os.getenv("LINGUATALES_ENABLE_SAY_FALLBACK") == "1" and os.uname().sysname == "Darwin" and shutil.which("say") is not None


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
