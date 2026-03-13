#!/usr/bin/env python3

from __future__ import annotations

import shutil
import sys
from pathlib import Path

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


def main() -> None:
    if len(sys.argv) < 4:
        raise SystemExit("Usage: extract_cover.py <input_path> <original_name> <output_path>")

    input_path = Path(sys.argv[1])
    original_name = sys.argv[2]
    output_path = Path(sys.argv[3])
    output_path.parent.mkdir(parents=True, exist_ok=True)

    extension = Path(original_name).suffix.lower()
    if extension in IMAGE_EXTENSIONS:
        save_image_cover(input_path, output_path)
        return
    if extension == ".pdf":
        save_pdf_cover(input_path, output_path)
        return
    if extension == ".epub":
        save_epub_cover(input_path, output_path)
        return

    raise SystemExit("Unsupported file type for cover extraction.")


def save_image_cover(input_path: Path, output_path: Path) -> None:
    try:
        from PIL import Image
    except ImportError as exc:
        raise SystemExit(
            "Image cover extraction requires pillow. Install Python dependencies from scripts/requirements.txt."
        ) from exc

    with Image.open(input_path) as image:
        image.convert("RGB").save(output_path, format="JPEG", quality=92)


def save_pdf_cover(input_path: Path, output_path: Path) -> None:
    try:
        import fitz
        from PIL import Image
    except ImportError as exc:
        raise SystemExit(
            "PDF cover extraction requires PyMuPDF and pillow. Install Python dependencies from scripts/requirements.txt."
        ) from exc

    document = fitz.open(str(input_path))
    if document.page_count <= 0:
        raise SystemExit("The PDF has no pages.")

    page = document[0]
    pixmap = page.get_pixmap(matrix=fitz.Matrix(1.6, 1.6), alpha=False)
    image = Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples)
    image.save(output_path, format="JPEG", quality=90)


def save_epub_cover(input_path: Path, output_path: Path) -> None:
    try:
        from ebooklib import ITEM_IMAGE, epub
    except ImportError as exc:
        raise SystemExit(
            "EPUB cover extraction requires ebooklib. Install Python dependencies from scripts/requirements.txt."
        ) from exc

    book = epub.read_epub(str(input_path))

    cover_item = None
    for item in book.get_items():
        name = (item.get_name() or "").lower()
        if "cover" in name and item.get_type() == ITEM_IMAGE:
            cover_item = item
            break

    if cover_item is None:
        for item in book.get_items_of_type(ITEM_IMAGE):
            cover_item = item
            break

    if cover_item is None:
        raise SystemExit("No EPUB cover image was found.")

    temp_source = output_path.with_suffix(Path(cover_item.get_name() or ".img").suffix or ".img")
    temp_source.write_bytes(cover_item.get_content())
    try:
        if temp_source.suffix.lower() in IMAGE_EXTENSIONS:
            save_image_cover(temp_source, output_path)
        else:
            shutil.copyfile(temp_source, output_path)
    finally:
        temp_source.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
