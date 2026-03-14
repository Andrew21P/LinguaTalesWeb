#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import tempfile
import wave
from pathlib import Path

import generate_audiobook as ga
from install_piper_voice import DEFAULT_VOICE_ID, ensure_voice_downloaded


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--metadata-output", default="")
    parser.add_argument("--language", default="pt")
    parser.add_argument("--speed", type=float, default=0.88)
    parser.add_argument("--voice-id", default=DEFAULT_VOICE_ID)
    parser.add_argument("--model-path", default="")
    parser.add_argument("--download-dir", default="data/piper/voices")
    parser.add_argument("--length-scale", type=float, default=1.22)
    parser.add_argument("--noise-scale", type=float, default=0.5)
    parser.add_argument("--noise-w-scale", type=float, default=0.72)
    parser.add_argument("--voice-sample", default="")
    return parser.parse_args()


def emit_progress(percent: int, message: str) -> None:
    print(f"PROGRESS:{percent}|{message}", flush=True)


def load_voice(model_path: str, voice_id: str, download_dir: str):
    emit_progress(10, "Loading Piper PT-PT voice.")
    final_model_path = ensure_voice_downloaded(
        voice_id=voice_id,
        download_dir=download_dir,
        model_path=model_path or None,
    )

    from piper.config import SynthesisConfig
    from piper.voice import PiperVoice

    voice = PiperVoice.load(final_model_path)
    emit_progress(12, f"Using Piper PT-PT voice {voice_id}.")
    return voice, SynthesisConfig, final_model_path


def generate_with_voice(
    *,
    voice,
    synthesis_config,
    input_path: Path,
    output_path: Path,
    metadata_output: Path | None,
    language: str,
    speed: float,
) -> dict:
    text = input_path.read_text(encoding="utf-8")
    prepared_text = ga.normalize_narration_text(text, language)
    segments = ga.segment_text(prepared_text, max_chars=420)

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_dir_path = Path(temp_dir)
        part_paths: list[Path] = []
        alignment_segments: list[dict] = []
        current_time = 0.0
        current_word = 0

        for index, segment in enumerate(segments):
            progress = 15 + int((index / max(len(segments), 1)) * 75)
            emit_progress(progress, f"Generating segment {index + 1} of {len(segments)} with Piper.")

            part_path = temp_dir_path / f"chunk-{index:04d}.wav"
            duration = synthesize_segment_to_wav(voice, synthesis_config, segment.text, part_path)
            part_paths.append(part_path)

            alignment_segments.append(
                {
                    "text": segment.text,
                    "start": current_time,
                    "end": current_time + duration,
                    "wordStart": current_word,
                    "wordEnd": current_word + segment.word_count,
                }
            )
            current_time += duration
            current_word += segment.word_count

            if segment.pause_after > 0:
                pause_path = temp_dir_path / f"pause-{index:04d}.wav"
                write_silence_wav(pause_path, voice.config.sample_rate, segment.pause_after)
                part_paths.append(pause_path)
                current_time += segment.pause_after

        emit_progress(92, "Combining narration chunks.")
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
                        "engine": "piper",
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

    emit_progress(100, "Audiobook finished.")
    return {
        "prepared_text": prepared_text,
        "segments": alignment_segments,
        "total_duration": current_time,
        "word_count": current_word,
    }


def synthesize_segment_to_wav(voice, synthesis_config, text: str, output_path: Path) -> float:
    total_samples = 0
    wav_params_set = False
    with wave.open(str(output_path), "wb") as wav_file:
        for audio_chunk in voice.synthesize(text, syn_config=synthesis_config, include_alignments=False):
            if not wav_params_set:
                wav_file.setframerate(audio_chunk.sample_rate)
                wav_file.setsampwidth(audio_chunk.sample_width)
                wav_file.setnchannels(audio_chunk.sample_channels)
                wav_params_set = True

            wav_file.writeframes(audio_chunk.audio_int16_bytes)
            total_samples += len(audio_chunk.audio_int16_array)

    return total_samples / max(1, voice.config.sample_rate)


def write_silence_wav(output_path: Path, sample_rate: int, duration: float) -> None:
    total_frames = max(1, int(round(sample_rate * max(0.0, duration))))
    with wave.open(str(output_path), "wb") as wav_file:
        wav_file.setframerate(sample_rate)
        wav_file.setsampwidth(2)
        wav_file.setnchannels(1)
        wav_file.writeframes(bytes(total_frames * 2))


def main() -> None:
    args = parse_args()
    if args.voice_sample:
        raise SystemExit(
            "Custom voice cloning is not supported in the fast CPU Piper path. Use the built-in PT-PT voice on VPS, or switch back to Chatterbox for slow clone experiments."
        )

    voice, synthesis_config_type, _model_path = load_voice(args.model_path, args.voice_id, args.download_dir)
    synthesis_config = synthesis_config_type(
        length_scale=args.length_scale,
        noise_scale=args.noise_scale,
        noise_w_scale=args.noise_w_scale,
    )
    generate_with_voice(
        voice=voice,
        synthesis_config=synthesis_config,
        input_path=Path(args.input),
        output_path=Path(args.output),
        metadata_output=Path(args.metadata_output) if args.metadata_output else None,
        language=args.language,
        speed=args.speed,
    )


if __name__ == "__main__":
    main()
