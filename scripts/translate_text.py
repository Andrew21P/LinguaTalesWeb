#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
from pathlib import Path


def normalize_language_code(value: str | None) -> str:
    code = (value or "").strip().lower().replace("_", "-")
    if code in {"", "auto"}:
        return "auto"
    if code.startswith("pt"):
        return "pt"
    if code.startswith("zh"):
        return "zh-CN"
    return code.split("-")[0]


def main() -> None:
    if len(sys.argv) < 4:
        raise SystemExit("Usage: translate_text.py <input_path> <source_language> <target_language>")

    input_path = Path(sys.argv[1])
    source_language = normalize_language_code(sys.argv[2])
    target_language = normalize_language_code(sys.argv[3])
    text = input_path.read_text(encoding="utf-8").strip()

    if not text:
        print(json.dumps({"provider": "none", "translatedText": ""}, ensure_ascii=False))
        return

    if source_language == target_language and source_language != "auto":
        print(json.dumps({"provider": "identity", "translatedText": text}, ensure_ascii=False))
        return

    try:
        from deep_translator import GoogleTranslator
    except ImportError as exc:
        raise SystemExit(
            "Google web translation requires deep-translator. Install Python dependencies from scripts/requirements.txt."
        ) from exc

    translator = GoogleTranslator(
        source="auto" if source_language == "auto" else source_language,
        target=target_language,
    )
    translated_text = translator.translate(text)
    print(json.dumps({"provider": "google-web", "translatedText": translated_text}, ensure_ascii=False))


if __name__ == "__main__":
    main()
