#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path


def normalize_language_code(value: str | None) -> str:
    code = (value or "").strip().lower().replace("_", "-")
    if code in {"", "auto"}:
        return "auto"
    if code == "pt-pt":
        return "pt-PT"
    if code == "pt-br":
        return "pt-BR"
    if code == "pt":
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

    translated_text = translate_with_google_web(
        text=text,
        source_language=source_language,
        target_language=target_language,
    )
    print(json.dumps({"provider": "google-web", "translatedText": translated_text}, ensure_ascii=False))


def translate_with_google_web(*, text: str, source_language: str, target_language: str) -> str:
    endpoint = "https://translate.googleapis.com/translate_a/single"
    params = urllib.parse.urlencode(
        {
            "client": "gtx",
            "sl": "auto" if source_language == "auto" else source_language,
            "tl": target_language,
            "dt": "t",
            "q": text,
        }
    )
    with urllib.request.urlopen(f"{endpoint}?{params}", timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    translated_text = "".join(part[0] for part in (payload[0] if payload and payload[0] else []) if part and part[0])
    if not translated_text.strip():
        raise SystemExit("Google web translation did not return any translated text.")
    return translated_text


if __name__ == "__main__":
    main()
