"""Tests de integracion de expedientes (US-029/US-030).

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
# Endpoint interno consultado cuando _document_for_actor cae a chequeo de grants.
GRANTS_URL_RE = f"{COLLABORATION_SERVICE_URL}/internal/collaboration/documents/"


def test_crear_expediente_requiere_usuario(client):
    res = client.post("/expedients", json={"name": "Contratos 2026"})
    assert res.status_code == 401


def test_crear_expediente_basico(client):
    res = client.post(
        "/expedients",
        headers={"X-User-Id": USER},
        json={"name": "Contratos 2026", "code": "EXP-2026-001", "description": "Contratos del año"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["name"] == "Contratos 2026"
    assert body["code"] == "EXP-2026-001"
    assert body["description"] == "Contratos del año"
    assert body["created_by_user_id"] == USER
    assert body["created_at"]


def test_codigo_duplicado_devuelve_409(client):
    payload = {"name": "Expediente A", "code": "DUP-001"}
    first = client.post("/expedients", headers={"X-User-Id": USER}, json=payload)
    assert first.status_code == 201
    second = client.post(
        "/expedients",
        headers={"X-User-Id": USER},
        json={"name": "Otro", "code": "DUP-001"},
    )
    assert second.status_code == 409


def test_listar_expedientes(client):
    client.post("/expedients", headers={"X-User-Id": USER}, json={"name": "Uno"})
    client.post("/expedients", headers={"X-User-Id": USER}, json={"name": "Dos"})
    listed = client.get("/expedients", headers={"X-User-Id": USER})
    assert listed.status_code == 200
    nombres = [item["name"] for item in listed.json()]
    assert "Uno" in nombres and "Dos" in nombres


@respx.mock
def test_detalle_expediente_incluye_documentos_visibles(client):
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

    exp = client.post(
        "/expedients",
        headers={"X-User-Id": USER},
        json={"name": "Expediente Z"},
    ).json()

    # Documento del usuario asociado al expediente
    own_doc = client.post(
        "/documents",
        headers={"X-User-Id": USER},
        json={
            "title": "Doc mio",
            "document_type_id": "t1",
            "description": "d",
            "expedient_id": exp["id"],
        },
    ).json()
    # Documento de OTRO usuario asociado al mismo expediente
    other_doc = client.post(
        "/documents",
        headers={"X-User-Id": OTHER},
        json={
            "title": "Doc ajeno",
            "document_type_id": "t1",
            "description": "d",
            "expedient_id": exp["id"],
        },
    ).json()

    # USER ve solo el suyo
    detail = client.get(f"/expedients/{exp['id']}", headers={"X-User-Id": USER}).json()
    doc_ids = {d["id"] for d in detail["documents"]}
    assert own_doc["id"] in doc_ids
    assert other_doc["id"] not in doc_ids

    # Admin ve ambos via X-User-Roles
    detail_admin = client.get(
        f"/expedients/{exp['id']}",
        headers={"X-User-Id": USER, "X-User-Roles": "admin"},
    ).json()
    doc_ids_admin = {d["id"] for d in detail_admin["documents"]}
    assert {own_doc["id"], other_doc["id"]}.issubset(doc_ids_admin)


def test_detalle_de_expediente_inexistente_devuelve_404(client):
    assert client.get("/expedients/no-existe", headers={"X-User-Id": USER}).status_code == 404


def test_listar_expedientes_filtra_por_proyecto(client):
    a = client.post("/expedients", headers={"X-User-Id": USER}, json={"name": "A", "project_id": "proj-1"}).json()
    client.post("/expedients", headers={"X-User-Id": USER}, json={"name": "B", "project_id": "proj-2"})
    listed = client.get("/expedients", headers={"X-User-Id": USER}, params={"project_id": "proj-1"}).json()
    ids = {e["id"] for e in listed}
    assert a["id"] in ids
    assert all(e["project_id"] == "proj-1" for e in listed)


@respx.mock
def test_attach_documents_asocia_y_omite_no_autorizados(client):
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
    # Sin grants explicitos -> _document_for_actor consulta este endpoint.
    respx.get(url__regex=rf"{GRANTS_URL_RE}.+/permissions").mock(
        return_value=httpx.Response(200, json={"permissions": []})
    )

    exp = client.post(
        "/expedients", headers={"X-User-Id": USER}, json={"name": "Bulk"}
    ).json()

    mio = client.post(
        "/documents",
        headers={"X-User-Id": USER},
        json={"title": "Mio", "document_type_id": "t1", "description": "d"},
    ).json()
    ajeno = client.post(
        "/documents",
        headers={"X-User-Id": OTHER},
        json={"title": "Ajeno", "document_type_id": "t1", "description": "d"},
    ).json()

    res = client.post(
        f"/expedients/{exp['id']}/documents",
        headers={"X-User-Id": USER},
        json={"document_ids": [mio["id"], ajeno["id"]]},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert mio["id"] in body["attached"]
    assert ajeno["id"] not in body["attached"]
    assert any(item["document_id"] == ajeno["id"] for item in body["skipped"])

    # El documento propio quedo realmente asociado.
    detail = client.get(f"/expedients/{exp['id']}", headers={"X-User-Id": USER}).json()
    assert any(doc["id"] == mio["id"] for doc in detail["documents"])


@respx.mock
def test_attach_documents_admin_bypass(client):
    respx.post(BOOTSTRAP_URL).mock(
        return_value=httpx.Response(
            201,
            json={
                "document_id": "x",
                "state_code": "borrador",
                "assignee_user_id": OTHER,
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

    exp = client.post(
        "/expedients", headers={"X-User-Id": USER}, json={"name": "Admin"}
    ).json()
    ajeno = client.post(
        "/documents",
        headers={"X-User-Id": OTHER},
        json={"title": "Ajeno", "document_type_id": "t1", "description": "d"},
    ).json()

    res = client.post(
        f"/expedients/{exp['id']}/documents",
        headers={"X-User-Id": USER, "X-User-Roles": "admin"},
        json={"document_ids": [ajeno["id"]]},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert ajeno["id"] in body["attached"]


@respx.mock
def test_attach_documents_idempotente(client):
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

    exp = client.post(
        "/expedients", headers={"X-User-Id": USER}, json={"name": "Idem"}
    ).json()
    doc = client.post(
        "/documents",
        headers={"X-User-Id": USER},
        json={
            "title": "Doc",
            "document_type_id": "t1",
            "description": "d",
            "expedient_id": exp["id"],
        },
    ).json()

    # Reasociar al mismo expediente no debe fallar; se reporta como attached.
    res = client.post(
        f"/expedients/{exp['id']}/documents",
        headers={"X-User-Id": USER},
        json={"document_ids": [doc["id"]]},
    )
    assert res.status_code == 200
    assert doc["id"] in res.json()["attached"]


@respx.mock
def test_eliminar_expediente_borra_sus_documentos(client):
    respx.post(BOOTSTRAP_URL).mock(
        return_value=httpx.Response(
            201,
            json={"document_id": "x", "state_code": "borrador", "assignee_user_id": USER, "assignment_role_code": "encargado"},
        )
    )
    respx.post(SUMMARIES_URL).mock(return_value=httpx.Response(200, json={"summaries": {}}))

    exp = client.post("/expedients", headers={"X-User-Id": USER}, json={"name": "Borrable"}).json()
    doc = client.post(
        "/documents",
        headers={"X-User-Id": USER},
        json={"title": "Doc", "document_type_id": "t1", "description": "d", "expedient_id": exp["id"]},
    ).json()

    # Un usuario que no es creador ni admin no puede eliminarlo.
    assert client.delete(f"/expedients/{exp['id']}", headers={"X-User-Id": OTHER}).status_code == 403

    # El creador lo elimina con sus documentos.
    res = client.delete(f"/expedients/{exp['id']}", headers={"X-User-Id": USER})
    assert res.status_code == 200, res.text
    assert res.json()["deleted_count"] == 1

    # El expediente ya no existe y el documento tampoco.
    assert client.get(f"/expedients/{exp['id']}", headers={"X-User-Id": USER}).status_code == 404
    assert client.get(f"/documents/{doc['id']}", headers={"X-User-Id": USER}).status_code == 404


@respx.mock
def test_eliminar_expediente_admin_bypass(client):
    respx.post(BOOTSTRAP_URL).mock(
        return_value=httpx.Response(
            201,
            json={"document_id": "x", "state_code": "borrador", "assignee_user_id": OTHER, "assignment_role_code": "encargado"},
        )
    )
    respx.post(SUMMARIES_URL).mock(return_value=httpx.Response(200, json={"summaries": {}}))

    exp = client.post("/expedients", headers={"X-User-Id": OTHER}, json={"name": "Ajeno"}).json()
    res = client.delete(f"/expedients/{exp['id']}", headers={"X-User-Id": USER, "X-User-Roles": "admin"})
    assert res.status_code == 200, res.text
