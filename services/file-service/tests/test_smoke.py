import pytest

from app.routers.files import _detect_mime_type, _safe_filename, _title_from_filename


@pytest.mark.unit
def test_safe_filename_evita_traversal():
    assert _safe_filename("../../etc/passwd") == "passwd"
    assert _safe_filename(None) == "archivo"


@pytest.mark.unit
def test_title_from_filename():
    assert _title_from_filename("informe_final-v2.pdf") == "informe final v2"


@pytest.mark.unit
def test_detect_mime_type_pdf():
    assert _detect_mime_type(b"%PDF-1.7 resto") == "application/pdf"
    assert _detect_mime_type(b"texto plano") == "text/plain"
