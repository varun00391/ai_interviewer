import io
import logging
import zipfile
from typing import BinaryIO

from docx import Document
from pypdf import PdfReader
from pypdf.errors import PdfReadError

logger = logging.getLogger(__name__)

_OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"


def _is_ole_compound_file(data: bytes) -> bool:
    return len(data) >= len(_OLE_MAGIC) and data[: len(_OLE_MAGIC)] == _OLE_MAGIC


def extract_resume_text(*, filename: str, fileobj: BinaryIO) -> str:
    raw = fileobj.read()
    if not raw:
        raise ValueError("Empty file")
    ext = (filename or "").rsplit(".", 1)[-1].lower()

    if len(raw) >= 4 and raw[:4] == b"%PDF":
        return _pdf_text(raw)

    sniffed = _sniff_format(raw)
    if sniffed == "docx" or ext == "docx":
        return _docx_text(raw)

    if ext == "doc" or (_is_ole_compound_file(raw) and sniffed != "docx"):
        raise ValueError("Legacy .doc is not supported. Save as .docx in Word and upload again.")

    if sniffed == "pdf" or ext == "pdf":
        return _pdf_text(raw)

    raise ValueError("Unsupported file type. Upload a .pdf or .docx file.")


def _sniff_format(data: bytes) -> str | None:
    """Infer PDF vs DOCX when the browser sends a generic MIME type or odd filename."""
    if len(data) >= 4 and data[:4] == b"%PDF":
        return "pdf"
    if len(data) >= 2 and data[:2] == b"PK":
        try:
            if zipfile.is_zipfile(io.BytesIO(data)):
                return "docx"
        except Exception:
            pass
    return None


def _pdf_text(data: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(data), strict=False)
    except PdfReadError as e:
        logger.warning("PdfReadError: %s", e)
        raise ValueError("Could not read this PDF (it may be corrupted or password-protected).") from e
    parts: list[str] = []
    for page in reader.pages:
        t = page.extract_text()
        if t:
            parts.append(t)
    text = "\n".join(parts).strip()
    if not text:
        raise ValueError("Could not extract text from PDF (it may be image-only).")
    return text


def _docx_text(data: bytes) -> str:
    try:
        doc = Document(io.BytesIO(data))
    except Exception as e:
        logger.exception("python-docx failed to open document")
        raise ValueError("Could not read this Word file (invalid or corrupted .docx).") from e
    parts: list[str] = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                t = cell.text.strip()
                if t:
                    parts.append(t)
    text = "\n".join(parts).strip()
    if not text:
        raise ValueError("Could not extract text from Word document.")
    return text
