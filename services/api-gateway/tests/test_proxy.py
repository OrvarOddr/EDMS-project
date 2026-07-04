"""Tests de integracion del proxy (upstream mockeado con respx)."""
import httpx
import pytest
import respx

from app.config import settings

pytestmark = pytest.mark.integration


def test_ruta_protegida_sin_token_devuelve_401(client):
    r = client.get("/documents")
    assert r.status_code == 401


def test_ruta_desconocida_devuelve_404(client, access_token):
    r = client.get("/desconocido", headers={"Authorization": f"Bearer {access_token}"})
    assert r.status_code == 404


def test_token_invalido_devuelve_401(client):
    r = client.get("/documents", headers={"Authorization": "Bearer no-es-un-jwt"})
    assert r.status_code == 401


@respx.mock
def test_ruta_publica_no_requiere_token(client):
    route = respx.post(f"{settings.AUTH_SERVICE_URL}/auth/login").mock(
        return_value=httpx.Response(200, json={"access_token": "x", "refresh_token": "y"})
    )
    r = client.post("/auth/login", json={"email": "a@b.cl", "password": "x"})
    assert r.status_code == 200
    assert route.called


@respx.mock
def test_proxy_reenvia_e_inyecta_headers_de_usuario(client, access_token):
    route = respx.get(f"{settings.DOCUMENT_SERVICE_URL}/documents").mock(
        return_value=httpx.Response(200, json=[])
    )
    r = client.get("/documents", headers={"Authorization": f"Bearer {access_token}"})
    assert r.status_code == 200
    assert route.called
    forwarded = route.calls.last.request
    assert forwarded.headers.get("X-User-Id") == "user-1"
    assert forwarded.headers.get("X-User-Email") == "user@edms.dev"
    assert "admin" in forwarded.headers.get("X-User-Roles", "")


@respx.mock
def test_proxy_propaga_status_del_upstream(client, access_token):
    respx.get(f"{settings.DOCUMENT_SERVICE_URL}/documents/x").mock(
        return_value=httpx.Response(404, json={"detail": "no existe"})
    )
    r = client.get("/documents/x", headers={"Authorization": f"Bearer {access_token}"})
    assert r.status_code == 404


@respx.mock
def test_proxy_ruta_projects_va_a_document_service(client, access_token):
    # /projects debe enrutar a document-service (regresion: se olvido en el mapa).
    route = respx.get(f"{settings.DOCUMENT_SERVICE_URL}/projects").mock(
        return_value=httpx.Response(200, json=[])
    )
    r = client.get("/projects", headers={"Authorization": f"Bearer {access_token}"})
    assert r.status_code == 200
    assert route.called
