"""US-033: fecha de vencimiento (requiere Postgres; corre en CI).

workflow-service y collaboration-service se mockean con respx.
"""
import httpx
import pytest
import respx

from tests.conftest import COLLABORATION_SERVICE_URL, WORKFLOW_SERVICE_URL

pytestmark = pytest.mark.integration

USER = "user-1"
BOOTSTRAP_URL = f"{WORKFLOW_SERVICE_URL}/internal/workflow/documents/bootstrap"
SUMMARIES_URL = f"{WORKFLOW_SERVICE_URL}/internal/workflow/documents/batch-summaries"
NOTIF_URL = f"{COLLABORATION_SERVICE_URL}/internal/collaboration/notifications"

BASE_META = {
    "title": "Doc con vencimiento",
    "document_type_id": "tipo-1",
    "description": "desc",
    "confidentiality_level": "publico_interno",
}


def _bootstrap_mock():
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


def _create_doc(client):
    r = client.post(
        "/documents",
        headers={"X-User-Id": USER},
        json={"title": "Doc", "document_type_id": "t1", "description": "d"},
    )
    assert r.status_code == 201, r.text
    return r.json()


@respx.mock
def test_documento_nuevo_sin_fecha(client):
    _bootstrap_mock()
    assert _create_doc(client)["due_date"] is None


@respx.mock
def test_definir_fecha_persiste_y_se_devuelve(client):
    _bootstrap_mock()
    respx.get(url__regex=rf"{WORKFLOW_SERVICE_URL}/internal/workflow/documents/.+/assignments").mock(
        return_value=httpx.Response(200, json=[{"user_id": USER}])
    )
    respx.post(NOTIF_URL).mock(return_value=httpx.Response(201))
    doc = _create_doc(client)

    r = client.patch(
        f"/documents/{doc['id']}/metadata",
        headers={"X-User-Id": USER},
        json={**BASE_META, "due_date": "2026-12-31"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["due_date"] is not None
    assert body["due_date"].startswith("2026-12-31")
    # queda auditado en la actividad de metadata
    cambios = [a for a in body["metadata_activity"] if "due_date" in a.get("changed_fields", [])]
    assert cambios, body["metadata_activity"]

    # persiste: el listado lo refleja
    respx.post(SUMMARIES_URL).mock(return_value=httpx.Response(200, json={"summaries": {}}))
    listed = client.get("/documents", headers={"X-User-Id": USER}).json()
    target = next(d for d in listed if d["id"] == doc["id"])
    assert target["due_date"].startswith("2026-12-31")


@respx.mock
def test_fecha_invalida_devuelve_422(client):
    _bootstrap_mock()
    doc = _create_doc(client)
    r = client.patch(
        f"/documents/{doc['id']}/metadata",
        headers={"X-User-Id": USER},
        json={**BASE_META, "due_date": "no-es-fecha"},
    )
    assert r.status_code == 422


@respx.mock
def test_limpiar_fecha(client):
    _bootstrap_mock()
    respx.get(url__regex=rf"{WORKFLOW_SERVICE_URL}/internal/workflow/documents/.+/assignments").mock(
        return_value=httpx.Response(200, json=[])
    )
    respx.post(NOTIF_URL).mock(return_value=httpx.Response(201))
    doc = _create_doc(client)

    client.patch(
        f"/documents/{doc['id']}/metadata",
        headers={"X-User-Id": USER},
        json={**BASE_META, "due_date": "2026-06-30"},
    )
    cleared = client.patch(
        f"/documents/{doc['id']}/metadata",
        headers={"X-User-Id": USER},
        json={**BASE_META, "due_date": ""},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["due_date"] is None
