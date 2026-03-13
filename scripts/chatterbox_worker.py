#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

import generate_audiobook as ga

TORCH = None
TA = None
MODEL = None
DEVICE = None
BASE_CONDS = None


def emit(event: dict) -> None:
    sys.stdout.write(json.dumps(event, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def load_runtime():
    global TORCH, TA, MODEL, DEVICE, BASE_CONDS

    if MODEL is not None:
        emit({"type": "progress", "percent": 12, "message": f"Reusing warm Chatterbox model on {DEVICE}."})
        return TORCH, TA, MODEL, DEVICE, BASE_CONDS

    emit({"type": "progress", "percent": 10, "message": "Loading Chatterbox models."})

    try:
        import torch
        import torchaudio as ta
        from chatterbox import mtl_tts as cb_mtl
    except ImportError as error:
        raise RuntimeError(
            "Chatterbox is not installed yet. Install the optional stack from scripts/requirements-chatterbox.txt."
        ) from error

    ga.patch_alignment_stream_analyzer(torch)
    device = ga.resolve_device(torch)
    emit({"type": "progress", "percent": 12, "message": f"Using the official Chatterbox multilingual model on {device}."})

    model = ga.load_multilingual_model(cb_mtl, torch, device)

    TORCH = torch
    TA = ta
    MODEL = model
    DEVICE = device
    BASE_CONDS = model.conds
    return TORCH, TA, MODEL, DEVICE, BASE_CONDS


def prepare_voice_prompt(model, voice_sample: str, exaggeration: float) -> None:
    if not voice_sample:
        return

    emit({"type": "progress", "percent": 14, "message": "Applying your uploaded voice sample as the prompt voice."})
    prompt_duration = ga.probe_audio_duration(Path(voice_sample))
    if prompt_duration < ga.MIN_VOICE_PROMPT_SECONDS:
        raise RuntimeError(
            "Your uploaded voice sample is too short after cleanup. Record 6 to 15 seconds in a quiet room, speak continuously, and upload it again."
        )

    try:
        model.prepare_conditionals(voice_sample, exaggeration=exaggeration)
    except RuntimeError as error:
        if "got: [1, 1, 0]" in str(error):
            raise RuntimeError(
                "Your uploaded voice sample became empty during prompt preparation. Re-record 6 to 15 seconds with steady speech and try again."
            ) from error
        raise


def process_job(payload: dict) -> None:
    input_path = Path(payload["input"])
    output_path = Path(payload["output"])
    metadata_output = Path(payload["metadata_output"]) if payload.get("metadata_output") else None
    language = str(payload.get("language") or "pt")
    voice_sample = str(payload.get("voice_sample") or "").strip()
    exaggeration = float(payload.get("exaggeration") or 0.56)
    speed = float(payload.get("speed") or 0.96)
    cfg_weight = float(payload.get("cfg_weight") or 0.32)

    text = input_path.read_text(encoding="utf-8")
    prepared_text = ga.normalize_narration_text(text, language)
    segments = ga.segment_text(prepared_text)

    torch, ta, model, _device, base_conds = load_runtime()
    model.conds = base_conds

    if voice_sample:
        prepare_voice_prompt(model, voice_sample, exaggeration)

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_dir_path = Path(temp_dir)
            part_paths = []
            alignment_segments: list[dict] = []
            current_time = 0.0
            current_word = 0

            for index, segment in enumerate(segments):
                progress = 15 + int((index / max(len(segments), 1)) * 75)
                emit({"type": "progress", "percent": progress, "message": f"Generating segment {index + 1} of {len(segments)}."})

                kwargs = {
                    "language_id": language,
                    "exaggeration": exaggeration,
                    "cfg_weight": cfg_weight,
                }
                try:
                    wav = model.generate(segment.text, **kwargs)
                except IndexError as error:
                    if "Expected reduction dim 1 to have non-zero size" in str(error):
                        emit(
                            {
                                "type": "progress",
                                "percent": progress,
                                "message": "Retrying a short segment without alignment integrity checks.",
                            }
                        )
                        wav = ga.generate_segment_without_alignment(model, segment.text, kwargs)
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

            emit({"type": "progress", "percent": 92, "message": "Combining narration chunks."})
            ga.combine_wavs(part_paths, output_path, speed)

            final_duration = ga.probe_audio_duration(output_path)
            if final_duration > 0 and current_time > 0:
                alignment_segments = ga.scale_alignment_segments(alignment_segments, final_duration / current_time)
                current_time = final_duration

            if metadata_output:
                metadata_output.parent.mkdir(parents=True, exist_ok=True)
                metadata_output.write_text(
                    json.dumps(
                        {
                            "segments": alignment_segments,
                            "totalDuration": current_time,
                            "wordCount": current_word,
                            "preparedText": prepared_text,
                            "speed": speed,
                        },
                        ensure_ascii=False,
                    ),
                    encoding="utf-8",
                )
    finally:
        model.conds = base_conds


def main() -> None:
    for line in sys.stdin:
        payload_raw = line.strip()
        if not payload_raw:
            continue

        try:
            payload = json.loads(payload_raw)
            process_job(payload)
            emit({"type": "done"})
        except Exception as error:  # noqa: BLE001
            emit({"type": "error", "message": str(error)})


if __name__ == "__main__":
    main()
