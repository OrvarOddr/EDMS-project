"""Tests de favoritos por usuario (PR favoritos+archivados+mover).

Requieren Postgres (lo provee el job de CI).
"""
import httpx
import pytest
import respx

from tests.conftest import COLLABORATION_SERVICE_URL, WORKFLOW_SERVICE_URL

pytestmark = pytest.mark.integration

USER = "user-1"
OTHER = "user-2"
BOOTSTRAP_URL = f"{WORKFLOW_SERVICE_URL}/internal/workflow/documents/bootstrap"
SUMMARIES_URL = f"{WORKFLOW_SERVICE_URL}/internal/workflow/documents/batch-summaries"
GRANTS_URL_RE = f"{COLLABORATION_SERVICE_URL}/internal/collaboration/documents/"


def _bootstrap_mocks():
    respx.post(BOOTSTRAP_URL).mock(
        return_value=httpx.Response(
            201,
            json={
                "document_id": "x",
                "state_code": "borrador",
                "assignee_user_id": USER,
                "assignment_role_code": "encargado",
            },
        )
    )
    respx.post(SUMMARIES_URL).mock(
        return_value=httpx.Response(200, json={"summaries": {}})
    )
    respx.get(url__regex=rf"{GRANTS_URL_RE}.+/permissions").mock(
        return_value=httpx.Response(200, json={"permissions": []})
    )


@respx.mock
def test_marcar_y_desmarcar_favorito(client):
    _bootstrap_mocks()
    doc = client.post(
        "/documents",
        headers={"X-User-Id": USER},
        json={"title": "Doc", "document_type_id": "t1", "description": "d"},
    ).json()

    on = client.post(f"/documents/{doc['id']}/favorite", headers={"X-User-Id": USER})
    assert on.status_code == 200
    assert on.json()["is_starred"] is True

    # POST de nuevo es idempotente.
    again = client.post(f"/documents/{doc['id']}/favorite", headers={"X-User-Id": USER})
    assert again.status_code == 200

    off = client.delete(f"/documents/{doc['id']}/favorite", headers={"X-User-Id": USER})
    assert off.status_code == 204

    # DELETE de nuevo es idempotente.
    again_off = client.delete(f"/documents/{doc['id']}/favorite", headers={"X-User-Id": USER})
    assert again_off.status_code == 204


@respx.mock
def test_lista_favoritos_solo_del_actor(client):
    _bootstrap_mocks()
    doc_a = client.post(
        "/documents",
        headers={"X-User-Id": USER},
        json={"title": "DocA", "document_type_id": "t1", "description": "d"},
    ).json()
    doc_b = client.post(
        "/documents",
        headers={"X-User-Id": OTHER},
        json={"title": "DocB", "document_type_id": "t1", "description": "d"},
    ).json()

    # USER marca su propio doc.
    client.post(f"/documents/{doc_a['id']}/favorite", headers={"X-User-Id": USER})
    # OTHER marca su propio doc.
    client.post(f"/documents/{doc_b['id']}/favorite", headers={"X-User-Id": OTHER})

    listed_user = client.get("/documents/favorites", headers={"X-User-Id": USER}).json()
    ids = [d["id"] for d in listed_user]
    assert doc_a["id"] in ids
    assert doc_b["id"] not in ids


@respx.mock
def test_is_starred_se_propaga_en_list_documents(client):
    _bootstrap_mocks()
    doc = client.post(
        "/documents",
        headers={"X-User-Id": USER},
        json={"title": "Stared", "document_type_id": "t1", "description": "d"},
    ).json()
    client.post(f"/documents/{doc['id']}/favorite", headers={"X-User-Id": USER})

    listed = client.get("/documents", headers={"X-User-Id": USER}).json()
    target = next(item for item in listed if item["id"] == doc["id"])
    assert target["is_starred"] is True


@respx.mock
def test_favoritos_excluye_papelera(client):
    _bootstrap_mocks()
    doc = client.post(
        "/documents",
        headers={"X-User-Id": USER},
        json={"title": "Bye", "document_type_id": "t1", "description": "d"},
    ).json()
    client.post(f"/documents/{doc['id']}/favorite", headers={"X-User-Id": USER})
    client.patch(f"/documents/{doc['id']}/trash", headers={"X-User-Id": USER})

    listed = client.get("/documents/favorites", headers={"X-User-Id": USER}).json()
    assert all(item["id"] != doc["id"] for item in listed)
