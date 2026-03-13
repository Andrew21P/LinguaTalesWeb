#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

WORD_PATTERN = re.compile(r"[\wºª]+(?:[-'’][\wºª]+)*", re.UNICODE)
MIN_VOICE_PROMPT_SECONDS = float(os.getenv("MIN_VOICE_PROMPT_SECONDS", "2.4"))
MASTERING_FILTER_CHAIN = ",".join(
    [
        "highpass=f=55",
        "lowpass=f=16800",
        "equalizer=f=180:t=q:w=0.9:g=0.4",
        "equalizer=f=2400:t=q:w=1.1:g=1.7",
        "equalizer=f=5600:t=q:w=1.2:g=1.7",
        "equalizer=f=8600:t=q:w=0.9:g=1.3",
        "equalizer=f=11200:t=q:w=0.8:g=0.8",
        "deesser=i=0.09:m=0.34:f=0.40:s=o",
        "acompressor=threshold=-21dB:ratio=2.0:attack=8:release=78:makeup=1.8",
        "speechnorm=e=6.3:r=0.00065:l=1",
        "alimiter=limit=0.94",
    ]
)

LANGUAGE_NUMBER_WORD = {
    "pt": "número",
    "en": "number",
    "es": "número",
    "fr": "numéro",
    "de": "nummer",
    "it": "numero",
    "nl": "nummer",
    "sv": "nummer",
    "pl": "numer",
    "tr": "numara",
    "zh": "号码",
    "ja": "番号",
}

LANGUAGE_ABBREVIATIONS = {
    "pt": [
        (r"\bSrs\.(?=\s|$)", "senhores"),
        (r"\bSras\.(?=\s|$)", "senhoras"),
        (r"\bSrta\.(?=\s|$)", "senhorita"),
        (r"\bSra\.(?=\s|$)", "senhora"),
        (r"\bSr\.(?=\s|$)", "senhor"),
        (r"\bDra\.(?=\s|$)", "doutora"),
        (r"\bDr\.(?=\s|$)", "doutor"),
        (r"\bProfa\.(?=\s|$)", "professora"),
        (r"\bProf\.(?=\s|$)", "professor"),
    ],
    "en": [
        (r"\bMrs\.(?=\s|$)", "missus"),
        (r"\bMr\.(?=\s|$)", "mister"),
        (r"\bMs\.(?=\s|$)", "miss"),
        (r"\bDr\.(?=\s|$)", "doctor"),
        (r"\bProf\.(?=\s|$)", "professor"),
    ],
    "es": [
        (r"\bSres\.(?=\s|$)", "señores"),
        (r"\bSras\.(?=\s|$)", "señoras"),
        (r"\bSrta\.(?=\s|$)", "señorita"),
        (r"\bSra\.(?=\s|$)", "señora"),
        (r"\bSr\.(?=\s|$)", "señor"),
        (r"\bDra\.(?=\s|$)", "doctora"),
        (r"\bDr\.(?=\s|$)", "doctor"),
        (r"\bProfa\.(?=\s|$)", "profesora"),
        (r"\bProf\.(?=\s|$)", "profesor"),
    ],
    "fr": [
        (r"\bMmes\.(?=\s|$)", "mesdames"),
        (r"\bMme\.(?=\s|$)", "madame"),
        (r"\bMlle\.(?=\s|$)", "mademoiselle"),
        (r"\bM\.(?=\s|$)", "monsieur"),
        (r"\bDr\.(?=\s|$)", "docteur"),
        (r"\bPr\.(?=\s|$)", "professeur"),
    ],
    "de": [
        (r"\bHr\.(?=\s|$)", "herr"),
        (r"\bFr\.(?=\s|$)", "frau"),
        (r"\bDr\.(?=\s|$)", "doktor"),
        (r"\bProf\.(?=\s|$)", "professor"),
    ],
    "it": [
        (r"\bSigg\.(?=\s|$)", "signori"),
        (r"\bSig\.ra(?=\s|$)", "signora"),
        (r"\bSig\.(?=\s|$)", "signore"),
        (r"\bDott\.ssa(?=\s|$)", "dottoressa"),
        (r"\bDott\.(?=\s|$)", "dottore"),
        (r"\bProf\.ssa(?=\s|$)", "professoressa"),
        (r"\bProf\.(?=\s|$)", "professore"),
    ],
    "nl": [
        (r"\bDhr\.(?=\s|$)", "meneer"),
        (r"\bMevr\.(?=\s|$)", "mevrouw"),
        (r"\bDr\.(?=\s|$)", "dokter"),
        (r"\bProf\.(?=\s|$)", "professor"),
    ],
    "sv": [
        (r"\bHr\.(?=\s|$)", "herr"),
        (r"\bDr\.(?=\s|$)", "doktor"),
        (r"\bProf\.(?=\s|$)", "professor"),
    ],
    "pl": [
        (r"\bDr\.(?=\s|$)", "doktor"),
        (r"\bProf\.(?=\s|$)", "profesor"),
    ],
    "tr": [
        (r"\bSn\.(?=\s|$)", "sayin"),
        (r"\bDr\.(?=\s|$)", "doktor"),
        (r"\bProf\.(?=\s|$)", "profesör"),
    ],
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--metadata-output", default="")
    parser.add_argument("--language", default="pt")
    parser.add_argument("--voice-sample", default="")
    parser.add_argument("--exaggeration", type=float, default=0.52)
    parser.add_argument("--speed", type=float, default=0.95)
    parser.add_argument("--cfg-weight", type=float, default=0.28)
    return parser.parse_args()


@dataclass
class NarrationSegment:
    text: str
    pause_after: float
    word_count: int
    kind: str = "speech"


def main() -> None:
    args = parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    text = input_path.read_text(encoding="utf-8")
    prepared_text = normalize_narration_text(text, args.language)
    segments = segment_text(prepared_text)

    print("PROGRESS:10|Loading Chatterbox models.", flush=True)

    try:
        import torch
        import torchaudio as ta
        from chatterbox import mtl_tts as cb_mtl
        patch_alignment_stream_analyzer(torch)
    except ImportError:
        if can_use_say_fallback():
            generate_with_say_fallback(args, segments, output_path)
            print("PROGRESS:100|Audiobook finished with macOS demo voice fallback.", flush=True)
            return

        raise SystemExit(
            "Chatterbox is not installed yet. Install the optional stack from scripts/requirements-chatterbox.txt on Linux or Apple Silicon, or use macOS for the built-in demo fallback."
        )

    device = resolve_device(torch)
    print(f"PROGRESS:12|Using the official Chatterbox multilingual model on {device}.", flush=True)
    model = load_multilingual_model(cb_mtl, torch, device)
    if args.voice_sample:
        print("PROGRESS:14|Applying your uploaded voice sample as the prompt voice.", flush=True)
        prompt_duration = probe_audio_duration(Path(args.voice_sample))
        if prompt_duration < MIN_VOICE_PROMPT_SECONDS:
            raise SystemExit(
                "Your uploaded voice sample is too short after cleanup. Record 6 to 15 seconds in a quiet room, speak continuously, and upload it again."
            )
        try:
            model.prepare_conditionals(args.voice_sample, exaggeration=args.exaggeration)
        except RuntimeError as error:
            if "got: [1, 1, 0]" in str(error):
                raise SystemExit(
                    "Your uploaded voice sample became empty during prompt preparation. Re-record 6 to 15 seconds with steady speech and try again."
                ) from error
            raise

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_dir_path = Path(temp_dir)
        part_paths = []
        alignment_segments: list[dict] = []
        current_time = 0.0
        current_word = 0

        for index, segment in enumerate(segments):
            progress = 15 + int((index / max(len(segments), 1)) * 75)
            print(f"PROGRESS:{progress}|Generating segment {index + 1} of {len(segments)}.", flush=True)

            kwargs = {
                "language_id": args.language,
                "exaggeration": args.exaggeration,
                "cfg_weight": args.cfg_weight,
            }
            try:
                wav = model.generate(segment.text, **kwargs)
            except IndexError as error:
                if "Expected reduction dim 1 to have non-zero size" in str(error):
                    print("PROGRESS:15|Retrying a short segment without alignment integrity checks.", flush=True)
                    wav = generate_segment_without_alignment(model, segment.text, kwargs)
                else:
                    raise
            part_path = temp_dir_path / f"chunk-{index:04d}.wav"
            ta.save(str(part_path), wav, model.sr)
            part_paths.append(part_path)

            segment_duration = float(wav.shape[-1] / model.sr)
            alignment_segments.append(
                {
                    "text": segment.text,
                    "start": current_time,
                    "end": current_time + segment_duration,
                    "wordStart": current_word,
                    "wordEnd": current_word + segment.word_count,
                }
            )
            current_time += segment_duration
            current_word += segment.word_count

            if segment.pause_after > 0:
                pause_frames = max(1, int(round(model.sr * segment.pause_after)))
                pause_duration = pause_frames / model.sr
                silence = torch.zeros((1, pause_frames), dtype=wav.dtype)
                pause_path = temp_dir_path / f"pause-{index:04d}.wav"
                ta.save(str(pause_path), silence, model.sr)
                part_paths.append(pause_path)
                current_time += pause_duration

        print("PROGRESS:92|Combining narration chunks.", flush=True)
        combine_wavs(part_paths, output_path, args.speed)
        final_duration = probe_audio_duration(output_path)
        if final_duration > 0 and current_time > 0:
            alignment_segments = scale_alignment_segments(alignment_segments, final_duration / current_time)
            current_time = final_duration

        if args.metadata_output:
            metadata_output = Path(args.metadata_output)
            metadata_output.parent.mkdir(parents=True, exist_ok=True)
            metadata_output.write_text(
                json.dumps(
                    {
                        "segments": alignment_segments,
                        "totalDuration": current_time,
                        "wordCount": current_word,
                        "preparedText": prepared_text,
                        "speed": args.speed,
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

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


def patch_alignment_stream_analyzer(torch_module) -> None:
    from chatterbox.models.t3.inference.alignment_stream_analyzer import AlignmentStreamAnalyzer, logger

    if getattr(AlignmentStreamAnalyzer.step, "__name__", "") == "safe_alignment_step":
        return

    # Upstream Chatterbox can crash on very short multilingual segments when the
    # trailing alignment slice has zero columns. Guard that edge case locally.
    def safe_alignment_step(self, logits, next_token=None):
        aligned_attn = torch_module.stack(self.last_aligned_attns).mean(dim=0)
        i, j = self.text_tokens_slice
        if self.curr_frame_pos == 0:
            A_chunk = aligned_attn[j:, i:j].clone().cpu()
        else:
            A_chunk = aligned_attn[:, i:j].clone().cpu()

        A_chunk[:, self.curr_frame_pos + 1:] = 0
        self.alignment = torch_module.cat((self.alignment, A_chunk), dim=0)

        A = self.alignment
        T, S = A.shape

        cur_text_posn = A_chunk[-1].argmax()
        discontinuity = not (-4 < cur_text_posn - self.text_position < 7)
        if not discontinuity:
            self.text_position = cur_text_posn

        false_start = (not self.started) and (A[-2:, -2:].max() > 0.1 or A[:, :4].max() < 0.5)
        self.started = not false_start
        if self.started and self.started_at is None:
            self.started_at = T

        self.complete = self.complete or self.text_position >= S - 3
        if self.complete and self.completed_at is None:
            self.completed_at = T

        long_tail = self.complete and (A[self.completed_at:, -3:].sum(dim=0).max() >= 5)

        alignment_repetition = False
        trailing_alignment = A[self.completed_at:, :-5] if self.complete else None
        if self.complete and trailing_alignment is not None and trailing_alignment.numel() > 0 and trailing_alignment.shape[1] > 0:
            alignment_repetition = trailing_alignment.max(dim=1).values.sum() > 5

        if next_token is not None:
            if isinstance(next_token, torch_module.Tensor):
                token_id = next_token.item() if next_token.numel() == 1 else next_token.view(-1)[0].item()
            else:
                token_id = next_token
            self.generated_tokens.append(token_id)
            if len(self.generated_tokens) > 8:
                self.generated_tokens = self.generated_tokens[-8:]

        token_repetition = len(self.generated_tokens) >= 3 and len(set(self.generated_tokens[-2:])) == 1
        if token_repetition:
            logger.warning(f"Detected 2x repetition of token {self.generated_tokens[-1]}")

        if cur_text_posn < S - 3 and S > 5:
            logits[..., self.eos_idx] = -(2**15)

        if long_tail or alignment_repetition or token_repetition:
            logger.warning(f"forcing EOS token, {long_tail=}, {alignment_repetition=}, {token_repetition=}")
            logits = -(2**15) * torch_module.ones_like(logits)
            logits[..., self.eos_idx] = 2**15

        self.curr_frame_pos += 1
        return logits

    AlignmentStreamAnalyzer.step = safe_alignment_step


def generate_segment_without_alignment(model, text: str, kwargs: dict):
    # `is_multilingual` only controls analyzer creation in upstream inference, so
    # temporarily disabling it is a safe way to retry a bad edge-case segment.
    original_flag = model.t3.hp.is_multilingual
    try:
        model.t3.hp.is_multilingual = False
        return model.generate(text, **kwargs)
    finally:
        model.t3.hp.is_multilingual = original_flag


def normalize_narration_text(text: str, language: str) -> str:
    language = (language or "").lower()
    normalized = text.replace("\r\n", "\n")
    normalized = re.sub(r"[ \t]+\n", "\n", normalized)
    normalized = re.sub(r"\n[ \t]+", "\n", normalized)
    normalized = re.sub(r"[ \t]{2,}", " ", normalized)

    normalized = expand_number_symbols(normalized, language)
    normalized = expand_language_abbreviations(normalized, language)

    # Prevent punctuation cleanup issues after spoken-form expansion.
    normalized = re.sub(r"\s+([,;:.!?…])", r"\1", normalized)
    normalized = re.sub(r"([(\[{])\s+", r"\1", normalized)
    normalized = re.sub(r"\s{2,}", " ", normalized)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized.strip()


def expand_number_symbols(text: str, language: str) -> str:
    language = (language or "").lower()
    number_word = LANGUAGE_NUMBER_WORD.get(language, "number")
    patterns = [
        r"\bN\.\s*[º°]\.?(?=\s*\d)",
        r"\bn\.\s*[º°]\.?(?=\s*\d)",
        r"\bN[º°]\.?(?=\s*\d)",
        r"\bn[º°]\.?(?=\s*\d)",
        r"\bN\.(?=\s*\d)",
        r"\bn\.(?=\s*\d)",
        r"\bNo\.(?=\s*\d)",
        r"\bno\.(?=\s*\d)",
        r"\bNr\.(?=\s*\d)",
        r"\bnr\.(?=\s*\d)",
        r"№(?=\s*\d)",
    ]
    for pattern in patterns:
        text = re.sub(
            pattern,
            lambda match: apply_source_casing(match.group(0), number_word),
            text,
        )
    return text


def expand_language_abbreviations(text: str, language: str) -> str:
    language = (language or "").lower()
    for pattern, replacement in LANGUAGE_ABBREVIATIONS.get(language, []):
        text = re.sub(
            pattern,
            lambda match: apply_source_casing(match.group(0), replacement),
            text,
            flags=re.IGNORECASE,
        )
    return text


def apply_source_casing(source: str, replacement: str) -> str:
    letters = "".join(character for character in source if character.isalpha())
    if len(letters) > 1 and letters.isupper():
        return replacement.upper()
    if letters[:1].isupper():
        return replacement.capitalize()
    return replacement


def segment_text(text: str, max_chars: int = 320) -> list[NarrationSegment]:
    normalized = text.replace("\r\n", "\n").strip()
    if not normalized:
        raise SystemExit("The provided text is empty.")

    narration_segments: list[NarrationSegment] = []
    paragraphs = [block.strip() for block in re.split(r"\n{2,}", normalized) if block.strip()]

    for paragraph_index, paragraph in enumerate(paragraphs):
        cleaned = re.sub(r"\s+", " ", paragraph).strip()
        clauses = split_paragraph_into_clauses(cleaned)
        for clause in clauses:
            wrapped_parts = wrap_long_clause(clause["text"], max_chars)
            for part_index, part in enumerate(wrapped_parts):
                pause_after = clause["pause_after"] if part_index == len(wrapped_parts) - 1 else 0.03
                narration_segments.append(
                    NarrationSegment(
                        text=part,
                        pause_after=pause_after,
                        word_count=count_words(part),
                    )
                )

        if narration_segments and paragraph_index < len(paragraphs) - 1:
            narration_segments[-1].pause_after = max(narration_segments[-1].pause_after, 0.28)

    return [segment for segment in narration_segments if segment.word_count > 0]


def split_paragraph_into_clauses(paragraph: str) -> list[dict]:
    pieces = re.findall(r"[^;:.!?…]+(?:[;:.!?…]+|$)", paragraph)
    clauses = []
    for piece in pieces:
        text = piece.strip()
        if not text:
            continue
        clauses.append(
            {
                "text": text,
                "pause_after": determine_pause(text),
            }
        )
    return clauses or [{"text": paragraph, "pause_after": 0.04}]


def determine_pause(text: str) -> float:
    stripped = text.rstrip()
    match = re.search(r"([,;:.!?…]+)[\"'”’)\]]*$", stripped)
    punctuation = match.group(1)[-1] if match else ""
    if punctuation and punctuation in ".!?…":
        return 0.20
    if punctuation and punctuation in ":;":
        return 0.12
    if punctuation == ",":
        return 0.07
    return 0.04


def wrap_long_clause(sentence: str, max_chars: int) -> list[str]:
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


def count_words(text: str) -> int:
    return len(WORD_PATTERN.findall(text))


def combine_wavs(part_paths: list[Path], output_path: Path, speed: float = 1.0) -> None:
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".txt") as list_file:
        list_path = Path(list_file.name)
        for part_path in part_paths:
            list_file.write(f"file '{part_path.as_posix()}'\n")

    try:
        raw_output_path = output_path.with_name(f"{output_path.stem}.raw.wav")
        mastering_filter_chain = MASTERING_FILTER_CHAIN
        if abs(speed - 1.0) > 0.001:
            mastering_filter_chain = f"{MASTERING_FILTER_CHAIN},atempo={max(0.5, min(2.0, speed)):.3f}"
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
                "-c:a",
                "pcm_s16le",
                str(raw_output_path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise SystemExit(result.stderr.strip() or "ffmpeg failed while combining audiobook chunks.")

        mastered = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(raw_output_path),
                "-af",
                mastering_filter_chain,
                "-ar",
                "24000",
                "-ac",
                "1",
                "-c:a",
                "pcm_s16le",
                str(output_path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if mastered.returncode != 0:
            raise SystemExit(mastered.stderr.strip() or "ffmpeg failed while mastering the audiobook.")
    finally:
        list_path.unlink(missing_ok=True)
        raw_output_path = output_path.with_name(f"{output_path.stem}.raw.wav")
        raw_output_path.unlink(missing_ok=True)


def probe_audio_duration(audio_path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(audio_path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return 0.0
    try:
        return float(result.stdout.strip())
    except ValueError:
        return 0.0


def scale_alignment_segments(segments: list[dict], scale_factor: float) -> list[dict]:
    if scale_factor <= 0:
        return segments

    return [
        {
            **segment,
            "start": segment["start"] * scale_factor,
            "end": segment["end"] * scale_factor,
        }
        for segment in segments
    ]


def can_use_say_fallback() -> bool:
    return os.getenv("LINGUATALES_ENABLE_SAY_FALLBACK") == "1" and os.uname().sysname == "Darwin" and shutil.which("say") is not None


def generate_with_say_fallback(args: argparse.Namespace, chunks: list[NarrationSegment], output_path: Path) -> None:
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
            print(f"PROGRESS:{progress}|Generating fallback segment {index + 1} of {len(chunks)}.", flush=True)

            text_path = temp_dir_path / f"chunk-{index:04d}.txt"
            part_path = temp_dir_path / f"chunk-{index:04d}.wav"
            text_path.write_text(chunk.text, encoding="utf-8")

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

            if chunk.pause_after > 0:
                pause_path = temp_dir_path / f"pause-{index:04d}.wav"
                result = subprocess.run(
                    [
                        "ffmpeg",
                        "-y",
                        "-f",
                        "lavfi",
                        "-i",
                        f"anullsrc=channel_layout=mono:sample_rate=22050",
                        "-t",
                        str(chunk.pause_after),
                        str(pause_path),
                    ],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if result.returncode != 0:
                    raise SystemExit(result.stderr.strip() or "ffmpeg failed while creating fallback pauses.")
                part_paths.append(pause_path)

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
