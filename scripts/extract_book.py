#!/usr/bin/env python3

import json
import re
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("Usage: extract_book.py <input_path> <original_name>")

    file_path = Path(sys.argv[1])
    original_name = sys.argv[2]
    extension = Path(original_name).suffix.lower()

    if extension == ".txt":
        text = file_path.read_text(encoding="utf-8", errors="ignore")
        payload = {
            "title": Path(original_name).stem,
            "text": normalize_text(text),
            "chapters": split_chapters(text),
            "source": "txt",
        }
    elif extension == ".pdf":
        payload = extract_pdf(file_path, original_name)
    elif extension == ".epub":
        payload = extract_epub(file_path, original_name)
    else:
        raise SystemExit(f"Unsupported file type: {extension}")

    print(json.dumps(payload, ensure_ascii=False))


def extract_pdf(file_path: Path, original_name: str) -> dict:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise SystemExit(
            "PDF extraction requires pypdf. Install Python dependencies from scripts/requirements.txt."
        ) from exc

    reader = PdfReader(str(file_path))
    pages = [page.extract_text() or "" for page in reader.pages]
    text = "\n\n".join(pages)
    normalized = normalize_text(text)
    return {
        "title": Path(original_name).stem,
        "text": normalized,
        "chapters": split_chapters(normalized),
        "source": "pdf",
    }


def extract_epub(file_path: Path, original_name: str) -> dict:
    try:
        from bs4 import BeautifulSoup
        from ebooklib import epub, ITEM_DOCUMENT
    except ImportError as exc:
        raise SystemExit(
            "EPUB extraction requires ebooklib and beautifulsoup4. Install Python dependencies from scripts/requirements.txt."
        ) from exc

    book = epub.read_epub(str(file_path))
    title_entries = book.get_metadata("DC", "title")
    title = title_entries[0][0] if title_entries else Path(original_name).stem

    chapter_chunks = []
    text_parts = []

    for item in book.get_items_of_type(ITEM_DOCUMENT):
        soup = BeautifulSoup(item.get_content(), "html.parser")
        for tag in soup(["script", "style", "nav"]):
            tag.decompose()

        raw_text = soup.get_text("\n", strip=True)
        normalized = normalize_text(raw_text)
        if not normalized:
            continue

        heading = guess_heading(soup) or f"Section {len(chapter_chunks) + 1}"
        chapter_chunks.append({"title": heading, "content": normalized})
        text_parts.append(normalized)

    full_text = normalize_text("\n\n".join(text_parts))
    return {
        "title": title,
        "text": full_text,
        "chapters": chapter_chunks or split_chapters(full_text),
        "source": "epub",
    }


def guess_heading(soup) -> str | None:
    for selector in ["h1", "h2", "title"]:
        node = soup.select_one(selector)
        if node:
            text = normalize_text(node.get_text(" ", strip=True))
            if text:
                return text[:120]
    return None


def normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_chapters(text: str) -> list[dict]:
    pattern = re.compile(
        r"(?:^|\n{2,})(chapter\s+\d+|cap[ií]tulo\s+\d+|part\s+\d+|parte\s+\d+|prologue|epilogue)[^\n]*",
        re.IGNORECASE,
    )
    matches = list(pattern.finditer(text))
    if not matches:
        return [{"title": "Complete Text", "content": normalize_text(text)}]

    chapters = []
    for index, match in enumerate(matches):
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        chapters.append(
            {
                "title": normalize_text(match.group(0)),
                "content": normalize_text(text[start:end]),
            }
        )
    return chapters


if __name__ == "__main__":
    main()
