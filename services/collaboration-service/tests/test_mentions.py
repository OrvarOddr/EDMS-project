"""Tests unitarios del parser de menciones (sin BD ni red)."""
import pytest

from app.routers.documents import _extract_mentions


@pytest.mark.unit
def test_menciones_unicas_y_en_orden():
    assert _extract_mentions("@ana revisa con @beto y avisa a @ana") == ["ana", "beto"]


@pytest.mark.unit
def test_menciones_admiten_punto_y_guion():
    assert _extract_mentions("hola @ana.perez y @juan-soto") == ["ana.perez", "juan-soto"]


@pytest.mark.unit
def test_sin_menciones_lista_vacia():
    assert _extract_mentions("texto sin arrobas") == []
    assert _extract_mentions("no@es@mencion") == ["es", "mencion"]
