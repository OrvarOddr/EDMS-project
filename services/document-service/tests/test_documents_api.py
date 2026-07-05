"""Tests de integracion de documentos (requieren Postgres; corren en CI).

workflow-service se mockea con respx (sin red real).
"""
import httpx
import pytest
import respx

from tests.conftest import WORKFLOW_SERVICE_URL

pytestmark = pytest.mark.integration

USER = "user-1"
BOOTSTRAP_URL = f"{WORKFLOW_SERVICE_URL}/internal/workflow/documents/bootstrap"
SUMMARIES_URL = f"{WORKFLOW_SERVICE_URL}/internal/workflow/documents/batch-summaries"

NEW_DOC = {
    "title": "Acta de reunion",
    "document_type_id": "tipo-1",
    "description": "Acta mensual",
}


def _bootstrap_response(document_id="*"):
    return httpx.Response(
        201,
        json={
            "document_id": document_id,
            "state_code": "borrador",
            "assignee_user_id": USER,
            "assignment_role_code": "encargado",
        },
    )


def test_crear_documento_requiere_usuario(client):
    assert client.post("/documents", json=NEW_DOC).status_code == 401


@respx.mock
def test_crear_documento_ok(client):
    respx.post(BOOTSTRAP_URL).mock(return_value=_bootstrap_response())
    r = client.post("/documents", headers={"X-User-Id": USER}, json=NEW_DOC)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["title"] == "Acta de reunion"
    assert body["id"]


@respx.mock
def test_crear_documento_falla_si_workflow_falla(client):
    respx.post(BOOTSTRAP_URL).mock(return_value=httpx.Response(500))
    r = client.post("/documents", headers={"X-User-Id": USER}, json=NEW_DOC)
    assert r.status_code == 502


@respx.mock
def test_listar_documentos_del_usuario(client):
    respx.post(BOOTSTRAP_URL).mock(return_value=_bootstrap_response())
    respx.post(SUMMARIES_URL).mock(return_value=httpx.Response(200, json={"summaries": {}}))

    client.post("/documents", headers={"X-User-Id": USER}, json=NEW_DOC)
    r = client.get("/documents", headers={"X-User-Id": USER})
    assert r.status_code == 200
    titles = [d["title"] for d in r.json()]
    assert "Acta de reunion" in titles


@respx.mock
def test_listar_documentos_respeta_limit(client):
    respx.post(BOOTSTRAP_URL).mock(return_value=_bootstrap_response())
    respx.post(SUMMARIES_URL).mock(return_value=httpx.Response(200, json={"summaries": {}}))

    for i in range(5):
        client.post("/documents", headers={"X-User-Id": USER}, json={**NEW_DOC, "title": f"Doc {i}"})

    r = client.get("/documents", headers={"X-User-Id": USER}, params={"limit": 3})
    assert r.status_code == 200
    assert len(r.json()) <= 3
