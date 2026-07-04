"""Tests de integracion de proyectos.

Proyecto -> Expedientes -> Documentos. Requieren Postgres (lo provee la CI).
"""
import httpx
import pytest
import respx

from tests.conftest import WORKFLOW_SERVICE_URL

pytestmark = pytest.mark.integration

USER = "user-1"
OTHER = "user-2"
BOOTSTRAP_URL = f"{WORKFLOW_SERVICE_URL}/internal/workflow/documents/bootstrap"
SUMMARIES_URL = f"{WORKFLOW_SERVICE_URL}/internal/workflow/documents/batch-summaries"


def _bootstrap_ok(assignee=USER):
    return httpx.Response(
        201,
        json={
            "document_id": "x",
            "state_code": "borrador",
            "assignee_user_id": assignee,
            "assignment_role_code": "encargado",
        },
    )


def _make_project_with_doc(client, owner, project_name):
    """Crea proyecto + expediente dentro + documento; devuelve (project, doc)."""
    project = client.post("/projects", headers={"X-User-Id": owner}, json={"name": project_name}).json()
    exp = client.post(
        "/expedients",
        headers={"X-User-Id": owner},
        json={"name": f"{project_name}-exp", "project_id": project["id"]},
    ).json()
    doc = client.post(
        "/documents",
        headers={"X-User-Id": owner},
        json={"title": "D", "document_type_id": "t1", "description": "d", "expedient_id": exp["id"]},
    ).json()
    return project, doc


def test_crear_proyecto_requiere_usuario(client):
    assert client.post("/projects", json={"name": "P"}).status_code == 401


def test_crear_proyecto_basico(client):
    res = client.post("/projects", headers={"X-User-Id": USER}, json={"name": "Legal 2026", "code": "PR-1"})
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["name"] == "Legal 2026"
    assert body["code"] == "PR-1"
    assert body["created_by_user_id"] == USER


def test_codigo_proyecto_duplicado_409(client):
    client.post("/projects", headers={"X-User-Id": USER}, json={"name": "A", "code": "DUP"})
    assert client.post("/projects", headers={"X-User-Id": USER}, json={"name": "B", "code": "DUP"}).status_code == 409


@respx.mock
def test_listar_proyectos_no_admin_solo_donde_participa(client):
    respx.post(BOOTSTRAP_URL).mock(return_value=_bootstrap_ok())
    respx.post(SUMMARIES_URL).mock(return_value=httpx.Response(200, json={"summaries": {}}))

    mio, _ = _make_project_with_doc(client, USER, "Mio")
    ajeno, _ = _make_project_with_doc(client, OTHER, "Ajeno")

    ids = {p["id"] for p in client.get("/projects", headers={"X-User-Id": USER}).json()}
    assert mio["id"] in ids
    assert ajeno["id"] not in ids


@respx.mock
def test_listar_proyectos_admin_ve_todos(client):
    respx.post(BOOTSTRAP_URL).mock(return_value=_bootstrap_ok(assignee=OTHER))
    respx.post(SUMMARIES_URL).mock(return_value=httpx.Response(200, json={"summaries": {}}))

    ajeno, _ = _make_project_with_doc(client, OTHER, "Ajeno")
    ids = {p["id"] for p in client.get("/projects", headers={"X-User-Id": USER, "X-User-Roles": "admin"}).json()}
    assert ajeno["id"] in ids


@respx.mock
def test_listar_proyectos_campos_derivados_por_asignacion(client):
    """USER ve un proyecto ajeno porque está asignado a un doc suyo; y trae los
    campos derivados agregados sobre los expedientes del proyecto."""
    respx.post(BOOTSTRAP_URL).mock(return_value=_bootstrap_ok(assignee=OTHER))

    project, doc = _make_project_with_doc(client, OTHER, "Compartido")

    respx.post(SUMMARIES_URL).mock(
        return_value=httpx.Response(
            200,
            json={"summaries": {doc["id"]: {"state_code": "aprobado", "assignee_user_id": OTHER, "assigned_user_ids": [USER]}}},
        )
    )

    listed = client.get("/projects", headers={"X-User-Id": USER}).json()
    match = next((p for p in listed if p["id"] == project["id"]), None)
    assert match is not None
    assert match["document_count"] == 1
    assert match["progress"] == 100
    assert match["status"] == "completado"
    assert match["pending_count"] == 0
    assert set(match["member_user_ids"]) == {OTHER, USER}
