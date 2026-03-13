#!/usr/bin/env python3

from __future__ import annotations

import io
import json
import re
import shutil
import sys
from pathlib import Path

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
LANGUAGE_TO_TESSERACT = {
    "pt": "por",
    "en": "eng",
    "es": "spa",
    "fr": "fra",
    "de": "deu",
    "it": "ita",
    "nl": "nld",
    "sv": "swe",
    "pl": "pol",
    "ru": "rus",
    "uk": "ukr",
    "tr": "tur",
    "zh": "chi_sim",
    "ja": "jpn",
}


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("Usage: extract_book.py <input_path> <original_name> [source_language_hint]")

    file_path = Path(sys.argv[1])
    original_name = sys.argv[2]
    source_language_hint = normalize_language_code(sys.argv[3]) if len(sys.argv) > 3 else "auto"
    extension = Path(original_name).suffix.lower()

    if extension == ".txt":
        text = file_path.read_text(encoding="utf-8", errors="ignore")
        payload = build_payload(
            title=Path(original_name).stem,
            text=text,
            chapters=split_chapters(text),
            source="txt",
            source_language_hint=source_language_hint,
        )
    elif extension == ".pdf":
        payload = extract_pdf(file_path, original_name, source_language_hint)
    elif extension == ".epub":
        payload = extract_epub(file_path, original_name, source_language_hint)
    elif extension in IMAGE_EXTENSIONS:
        payload = extract_image(file_path, original_name, source_language_hint)
    else:
        raise SystemExit(f"Unsupported file type: {extension}")

    print(json.dumps(payload, ensure_ascii=False))


def extract_pdf(file_path: Path, original_name: str, source_language_hint: str) -> dict:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise SystemExit(
            "PDF extraction requires pypdf. Install Python dependencies from scripts/requirements.txt."
        ) from exc

    reader = PdfReader(str(file_path))
    pages = [page.extract_text() or "" for page in reader.pages]
    extracted_text = "\n\n".join(pages)
    normalized = normalize_text(extracted_text)
    ocr_used = False

    # Many scanned PDFs have almost no embedded text. Fall back to OCR when that happens.
    if should_ocr_pdf(normalized, len(reader.pages)):
        ocr_text = extract_pdf_with_ocr(file_path, source_language_hint)
        if ocr_text:
            normalized = normalize_text(ocr_text)
            ocr_used = True

    return build_payload(
        title=Path(original_name).stem,
        text=normalized,
        chapters=split_chapters(normalized),
        source="pdf+ocr" if ocr_used else "pdf",
        source_language_hint=source_language_hint,
        ocr_used=ocr_used,
    )


def extract_epub(file_path: Path, original_name: str, source_language_hint: str) -> dict:
    try:
        from bs4 import BeautifulSoup
        from ebooklib import ITEM_DOCUMENT, epub
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
    return build_payload(
        title=title,
        text=full_text,
        chapters=chapter_chunks or split_chapters(full_text),
        source="epub",
        source_language_hint=source_language_hint,
    )


def extract_image(file_path: Path, original_name: str, source_language_hint: str) -> dict:
    text = ocr_image_file(file_path, source_language_hint)
    normalized = normalize_text(text)
    return build_payload(
        title=Path(original_name).stem,
        text=normalized,
        chapters=split_chapters(normalized),
        source="image+ocr",
        source_language_hint=source_language_hint,
        ocr_used=True,
    )


def build_payload(
    *,
    title: str,
    text: str,
    chapters: list[dict],
    source: str,
    source_language_hint: str,
    ocr_used: bool = False,
) -> dict:
    normalized = normalize_text(text)
    detected_language = detect_language(normalized, source_language_hint)
    return {
        "title": title,
        "text": normalized,
        "chapters": chapters if chapters else split_chapters(normalized),
        "source": source,
        "detectedLanguage": detected_language or None,
        "ocrUsed": ocr_used,
    }


def should_ocr_pdf(text: str, page_count: int) -> bool:
    if not text.strip():
        return True
    if page_count <= 0:
        return False
    average_chars_per_page = len(text) / page_count
    return average_chars_per_page < 120


def extract_pdf_with_ocr(file_path: Path, source_language_hint: str) -> str:
    try:
        import fitz
        from PIL import Image
    except ImportError:
        return ""

    document = fitz.open(str(file_path))
    text_parts = []
    for page in document:
        pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        image = Image.open(io.BytesIO(pixmap.tobytes("png")))
        text_parts.append(run_tesseract(image, source_language_hint))
    return "\n\n".join(text_parts)


def ocr_image_file(file_path: Path, source_language_hint: str) -> str:
    try:
        from PIL import Image
    except ImportError as exc:
        raise SystemExit(
            "Image OCR requires pillow and pytesseract. Install Python dependencies from scripts/requirements.txt."
        ) from exc

    image = Image.open(file_path)
    return run_tesseract(image, source_language_hint)


def run_tesseract(image, source_language_hint: str) -> str:
    if shutil.which("tesseract") is None:
        raise SystemExit("OCR requires the tesseract binary to be installed and available on PATH.")

    try:
        import pytesseract
    except ImportError as exc:
        raise SystemExit(
            "OCR requires pytesseract. Install Python dependencies from scripts/requirements.txt."
        ) from exc

    available_languages = set(pytesseract.get_languages(config=""))
    lang = resolve_tesseract_languages(available_languages, source_language_hint)
    prepared = prepare_image_for_ocr(image)
    return pytesseract.image_to_string(prepared, lang=lang, config="--psm 6")


def prepare_image_for_ocr(image):
    from PIL import ImageOps

    grayscale = ImageOps.autocontrast(image.convert("L"))
    enlarged = grayscale.resize((grayscale.width * 2, grayscale.height * 2))
    return enlarged.point(lambda value: 255 if value > 168 else 0)


def resolve_tesseract_languages(available_languages: set[str], source_language_hint: str) -> str:
    candidates = []
    hinted = LANGUAGE_TO_TESSERACT.get(source_language_hint)
    if hinted:
        candidates.append(hinted)
    candidates.extend(["por", "eng", "spa", "fra", "deu", "ita", "nld", "rus", "ukr"])

    selected = [candidate for candidate in candidates if candidate in available_languages]
    if not selected:
        return "eng" if "eng" in available_languages else next(iter(available_languages), "eng")
    if len(selected) == 1:
        return selected[0]
    return "+".join(dict.fromkeys(selected))


def detect_language(text: str, source_language_hint: str) -> str:
    if source_language_hint and source_language_hint != "auto":
        return source_language_hint
    try:
        from langdetect import DetectorFactory, detect
    except ImportError:
        return "pt"

    if len(text.strip()) < 24:
        return "pt"

    DetectorFactory.seed = 0
    try:
        code = normalize_language_code(detect(text))
    except Exception:
        return "pt"
    return code or "pt"


def normalize_language_code(value: str | None) -> str:
    code = (value or "").strip().lower().replace("_", "-")
    if code in {"", "auto"}:
        return "auto"
    if code.startswith("pt"):
        return "pt"
    return code.split("-")[0]


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
