"""Tests de la vista Archivados (estado terminal del workflow).

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


def _bootstrap_default():
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
    respx.get(url__regex=rf"{GRANTS_URL_RE}.+/permissions").mock(
        return_value=httpx.Response(200, json={"permissions": []})
    )


def _create_doc(client, user_id, title):
    return client.post(
        "/documents",
        headers={"X-User-Id": user_id},
        json={"title": title, "document_type_id": "t1", "description": "d"},
    ).json()


@respx.mock
def test_archivados_filtra_estados_terminales(client):
    """Solo aparecen los documentos en estado aprobado/rechazado/archivado."""
    _bootstrap_default()

    doc_borrador = _create_doc(client, USER, "Borrador")
    doc_aprobado = _create_doc(client, USER, "Aprobado")
    doc_rechazado = _create_doc(client, USER, "Rechazado")
    doc_otro_revisor = _create_doc(client, USER, "En revision")

    # Summaries: aprobado y rechazado son terminales; borrador y en_revision no.
    respx.post(SUMMARIES_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "summaries": {
                    doc_borrador["id"]: {"state_code": "borrador", "assignee_user_id": USER, "assigned_user_ids": []},
                    doc_aprobado["id"]: {"state_code": "aprobado", "assignee_user_id": USER, "assigned_user_ids": []},
                    doc_rechazado["id"]: {"state_code": "rechazado", "assignee_user_id": USER, "assigned_user_ids": []},
                    doc_otro_revisor["id"]: {"state_code": "en_revision", "assignee_user_id": USER, "assigned_user_ids": []},
                }
            },
        )
    )

    listed = client.get("/documents/archived", headers={"X-User-Id": USER}).json()
    ids = {item["id"] for item in listed}
    assert doc_aprobado["id"] in ids
    assert doc_rechazado["id"] in ids
    assert doc_borrador["id"] not in ids
    assert doc_otro_revisor["id"] not in ids


@respx.mock
def test_archivados_respeta_visibilidad_por_usuario(client):
    """USER_B no ve los aprobados de USER_A salvo asignacion explicita."""
    _bootstrap_default()
    doc_a = _create_doc(client, USER, "DocA")

    respx.post(SUMMARIES_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "summaries": {
                    doc_a["id"]: {"state_code": "aprobado", "assignee_user_id": USER, "assigned_user_ids": []},
                }
            },
        )
    )

    listed_otro = client.get("/documents/archived", headers={"X-User-Id": OTHER}).json()
    assert all(item["id"] != doc_a["id"] for item in listed_otro)


@respx.mock
def test_archivados_admin_bypass(client):
    """Con X-User-Roles=admin se ven todos los docs en estados terminales."""
    _bootstrap_default()
    doc_a = _create_doc(client, USER, "DocA")

    respx.post(SUMMARIES_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "summaries": {
                    doc_a["id"]: {"state_code": "aprobado", "assignee_user_id": USER, "assigned_user_ids": []},
                }
            },
        )
    )

    listed = client.get(
        "/documents/archived",
        headers={"X-User-Id": OTHER, "X-User-Roles": "admin"},
    ).json()
    assert any(item["id"] == doc_a["id"] for item in listed)


@respx.mock
def test_archivados_excluye_papelera(client):
    """Un doc en papelera (archived_at != null) no aparece en archivados."""
    _bootstrap_default()
    doc = _create_doc(client, USER, "Doc")

    respx.post(SUMMARIES_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "summaries": {
                    doc["id"]: {"state_code": "aprobado", "assignee_user_id": USER, "assigned_user_ids": []},
                }
            },
        )
    )
    # Lo mandamos a papelera.
    client.patch(f"/documents/{doc['id']}/trash", headers={"X-User-Id": USER})

    listed = client.get("/documents/archived", headers={"X-User-Id": USER}).json()
    assert all(item["id"] != doc["id"] for item in listed)
