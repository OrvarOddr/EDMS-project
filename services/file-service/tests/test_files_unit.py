"""Tests unitarios de validadores de file-service (sin BD ni MinIO)."""
import asyncio
import io

import pytest
from fastapi import HTTPException

from app.routers.files import (
    _detect_mime_type,
    _read_limited_upload,
    _safe_filename,
    _title_from_filename,
)


class _FakeUpload:
    def __init__(self, data: bytes):
        self._buf = io.BytesIO(data)

    async def read(self, n: int) -> bytes:
        return self._buf.read(n)


@pytest.mark.unit
def test_safe_filename_evita_path_traversal():
    assert _safe_filename("../../etc/passwd") == "passwd"
    # caracteres no permitidos se reemplazan por "-" y se quita la ruta
    assert _safe_filename("dir/re porte?.txt") == "re-porte-.txt"
    assert "/" not in _safe_filename("a/b/c.png")
    assert _safe_filename(None) == "archivo"
    assert _safe_filename("") == "archivo"


@pytest.mark.unit
def test_title_from_filename_normaliza():
    assert _title_from_filename("informe_final-v2.pdf") == "informe final v2"
    assert _title_from_filename("plan.docx") == "plan"


@pytest.mark.unit
def test_detect_mime_type_por_firma():
    assert _detect_mime_type(b"%PDF-1.7...") == "application/pdf"
    assert _detect_mime_type(b"\x89PNG\r\n\x1a\nrest") == "image/png"
    assert _detect_mime_type(b"\xff\xd8\xffjpeg") == "image/jpeg"
    assert _detect_mime_type("texto con acentos: áéíóú".encode()) == "text/plain"
    assert _detect_mime_type(b"binario\x00oculto") is None
    assert _detect_mime_type(b"utf8-invalido-\xff") is None


@pytest.mark.unit
def test_read_limited_upload_acepta_bajo_el_limite():
    data = b"x" * 100
    out = asyncio.run(_read_limited_upload(_FakeUpload(data), max_bytes=200))
    assert out == data


@pytest.mark.unit
def test_read_limited_upload_rechaza_sobre_el_limite():
    data = b"x" * (2 * 1024 * 1024 + 1)  # > 1 chunk
    with pytest.raises(HTTPException) as exc:
        asyncio.run(_read_limited_upload(_FakeUpload(data), max_bytes=1024))
    assert exc.value.status_code == 413
