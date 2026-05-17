import pytest

from app.routers.documents import _extract_mentions


@pytest.mark.unit
def test_extract_mentions_unicas_y_en_orden():
    assert _extract_mentions("hola @ana y @beto y @ana") == ["ana", "beto"]


@pytest.mark.unit
def test_extract_mentions_sin_menciones():
    assert _extract_mentions("texto sin menciones") == []
