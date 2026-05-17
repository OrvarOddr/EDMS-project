"""Tests de integracion de comentarios (requieren Postgres; corren en CI).

document-service y workflow-service se mockean con respx (sin red real).
"""
import httpx
import pytest
import respx

from tests.conftest import DOCUMENT_SERVICE_URL, WORKFLOW_SERVICE_URL

pytestmark = pytest.mark.integration

DOC = "doc-1"
AUTHOR = "autor-1"

ACCESS_URL = f"{DOCUMENT_SERVICE_URL}/internal/documents/{DOC}/access"
ASSIGNMENTS_URL = f"{WORKFLOW_SERVICE_URL}/internal/workflow/documents/{DOC}/assignments"


def test_sin_usuario_devuelve_401(client):
    r = client.post(f"/collaboration/documents/{DOC}/comments", json={"body": "hola"})
    assert r.status_code == 401


def test_cuerpo_vacio_devuelve_400(client):
    r = client.post(
        f"/collaboration/documents/{DOC}/comments",
        headers={"X-User-Id": AUTHOR},
        json={"body": "   "},
    )
    assert r.status_code == 400


@respx.mock
def test_permiso_denegado_propaga_403(client):
    respx.get(ACCESS_URL).mock(return_value=httpx.Response(403))
    r = client.post(
        f"/collaboration/documents/{DOC}/comments",
        headers={"X-User-Id": AUTHOR},
        json={"body": "no deberia entrar"},
    )
    assert r.status_code == 403


@respx.mock
def test_comentario_notifica_a_asignados_y_mencionados(client):
    respx.get(ACCESS_URL).mock(return_value=httpx.Response(200))
    respx.get(ASSIGNMENTS_URL).mock(
        return_value=httpx.Response(200, json=[{"user_id": "encargado-1"}, {"user_id": AUTHOR}])
    )

    r = client.post(
        f"/collaboration/documents/{DOC}/comments",
        headers={"X-User-Id": AUTHOR},
        json={"body": "Revisar esto @ana", "mentioned_user_ids": ["ana-id"]},
    )
    assert r.status_code == 201, r.text
    assert r.json()["action"] == "comment"

    # El asignado (distinto del autor) recibe "nuevo_comentario"
    asignado = client.get(
        "/collaboration/notifications", headers={"X-User-Id": "encargado-1"}
    ).json()
    assert any(n["type"] == "nuevo_comentario" for n in asignado["items"])

    # El mencionado recibe "mencion"
    mencionado = client.get(
        "/collaboration/notifications", headers={"X-User-Id": "ana-id"}
    ).json()
    assert any(n["type"] == "mencion" for n in mencionado["items"])

    # El autor no se autonotifica
    autor = client.get(
        "/collaboration/notifications", headers={"X-User-Id": AUTHOR}
    ).json()
    assert autor["items"] == []


@respx.mock
def test_comentario_sin_asignados_no_falla(client):
    respx.get(ACCESS_URL).mock(return_value=httpx.Response(200))
    respx.get(ASSIGNMENTS_URL).mock(return_value=httpx.Response(200, json=[]))
    r = client.post(
        f"/collaboration/documents/{DOC}/comments",
        headers={"X-User-Id": AUTHOR},
        json={"body": "comentario simple"},
    )
    assert r.status_code == 201
