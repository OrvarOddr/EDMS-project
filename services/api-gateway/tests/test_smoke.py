import pytest

from app.config import settings
from app.routers.proxy import _resolve_service
from app.security import is_public


@pytest.mark.unit
def test_resolve_service_rutas_conocidas():
    assert _resolve_service("/auth/login") == settings.AUTH_SERVICE_URL
    assert _resolve_service("/collaboration/notifications") == settings.COLLABORATION_SERVICE_URL
    assert _resolve_service("/desconocido") is None


@pytest.mark.unit
def test_rutas_publicas():
    assert is_public("POST", "/auth/login")
    assert not is_public("GET", "/documents")
