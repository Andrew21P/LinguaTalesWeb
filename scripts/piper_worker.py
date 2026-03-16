#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
from pathlib import Path

import generate_audiobook_piper as gp

VOICE = None
SYNTHESIS_CONFIG = None
MODEL_PATH = None
VOICE_ID = None


def emit(event: dict) -> None:
    sys.stdout.write(json.dumps(event, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def load_runtime(model_path: str, voice_id: str, download_dir: str):
    global VOICE, SYNTHESIS_CONFIG, MODEL_PATH, VOICE_ID

    if VOICE is not None and MODEL_PATH == model_path and VOICE_ID == voice_id:
        emit({"type": "progress", "percent": 12, "message": f"Reusing warm Piper voice {voice_id}."})
        return VOICE, SYNTHESIS_CONFIG

    def progress(percent: int, message: str) -> None:
        emit({"type": "progress", "percent": percent, "message": message})

    gp.emit_progress = progress
    voice, synthesis_config_type, final_model_path = gp.load_voice(model_path, voice_id, download_dir)

    VOICE = voice
    SYNTHESIS_CONFIG = synthesis_config_type
    MODEL_PATH = str(final_model_path)
    VOICE_ID = voice_id
    return VOICE, SYNTHESIS_CONFIG


def process_job(payload: dict) -> None:
    input_path = Path(payload["input"])
    output_path = Path(payload["output"])
    metadata_output = Path(payload["metadata_output"]) if payload.get("metadata_output") else None
    language = str(payload.get("language") or "pt")
    speed = float(payload.get("speed") or 0.78)
    voice_sample = str(payload.get("voice_sample") or "").strip()
    voice_id = str(payload.get("voice_id") or gp.DEFAULT_VOICE_ID)
    model_path = str(payload.get("model_path") or "")
    download_dir = str(payload.get("download_dir") or "data/piper/voices")
    length_scale = float(payload.get("length_scale") or 1.22)
    noise_scale = float(payload.get("noise_scale") or 0.5)
    noise_w_scale = float(payload.get("noise_w_scale") or 0.72)

    if voice_sample:
        raise RuntimeError(
            "Custom voice cloning is not supported in the fast CPU Piper path. Use the built-in PT-PT voice on VPS, or switch back to Chatterbox for slow clone experiments."
        )

    voice, synthesis_config_type = load_runtime(model_path, voice_id, download_dir)
    synthesis_config = synthesis_config_type(
        length_scale=length_scale,
        noise_scale=noise_scale,
        noise_w_scale=noise_w_scale,
    )

    original_emit = gp.emit_progress

    def progress(percent: int, message: str) -> None:
        emit({"type": "progress", "percent": percent, "message": message})

    gp.emit_progress = progress
    try:
        gp.generate_with_voice(
            voice=voice,
            synthesis_config=synthesis_config,
            input_path=input_path,
            output_path=output_path,
            metadata_output=metadata_output,
            language=language,
            speed=speed,
        )
    finally:
        gp.emit_progress = original_emit


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
