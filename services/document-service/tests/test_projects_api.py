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


def test_crear_proyecto_con_coordinador_y_miembros(client):
    """Al crear se asigna coordinador y miembros explicitos; ambos ven el
    proyecto aunque no tengan documentos."""
    THIRD = "user-3"
    res = client.post(
        "/projects",
        headers={"X-User-Id": USER},
        json={"name": "Con equipo", "coordinator_user_id": OTHER, "member_user_ids": [THIRD, OTHER, THIRD]},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["coordinator_user_id"] == OTHER
    # OTHER es coordinador -> se excluye de miembros; sin duplicados.
    assert body["member_user_ids"] == [THIRD]

    pid = body["id"]
    # El coordinador (OTHER) y el miembro (THIRD) ven el proyecto.
    assert any(p["id"] == pid for p in client.get("/projects", headers={"X-User-Id": OTHER}).json())
    assert any(p["id"] == pid for p in client.get("/projects", headers={"X-User-Id": THIRD}).json())
    # Un usuario sin relacion NO lo ve.
    assert not any(p["id"] == pid for p in client.get("/projects", headers={"X-User-Id": "nadie"}).json())


@respx.mock
def test_eliminar_proyecto_borra_todo(client):
    respx.post(BOOTSTRAP_URL).mock(return_value=_bootstrap_ok())
    respx.post(SUMMARIES_URL).mock(return_value=httpx.Response(200, json={"summaries": {}}))

    project, doc = _make_project_with_doc(client, USER, "Borrable")

    # Un usuario sin relacion no puede eliminarlo.
    assert client.delete(f"/projects/{project['id']}", headers={"X-User-Id": "nadie"}).status_code == 403

    # El creador lo elimina con todo su contenido.
    res = client.delete(f"/projects/{project['id']}", headers={"X-User-Id": USER})
    assert res.status_code == 200, res.text
    assert res.json()["deleted_count"] == 1

    # El proyecto ya no aparece (ni para admin) y el documento tampoco.
    assert not any(
        p["id"] == project["id"]
        for p in client.get("/projects", headers={"X-User-Id": USER, "X-User-Roles": "admin"}).json()
    )
    assert client.get(f"/documents/{doc['id']}", headers={"X-User-Id": USER}).status_code == 404


@respx.mock
def test_metricas_acotadas_por_proyecto(client):
    """Las metricas del dashboard se acotan al proyecto (?project_id=): un
    proyecto con documentos cuenta los suyos y uno vacio devuelve todo en cero
    (antes heredaba los totales globales del usuario)."""
    respx.post(BOOTSTRAP_URL).mock(return_value=_bootstrap_ok())

    project_con, doc = _make_project_with_doc(client, USER, "Con documentos")
    project_vacio = client.post(
        "/projects", headers={"X-User-Id": USER}, json={"name": "Vacio"}
    ).json()

    respx.post(SUMMARIES_URL).mock(
        return_value=httpx.Response(
            200,
            json={"summaries": {doc["id"]: {"state_code": "borrador", "assignee_user_id": USER}}},
        )
    )

    con = client.get(
        "/documents/metrics",
        headers={"X-User-Id": USER},
        params={"project_id": project_con["id"]},
    )
    assert con.status_code == 200, con.text
    con_body = con.json()
    assert con_body["total"] == 1
    assert con_body["by_state"].get("borrador") == 1

    vacio = client.get(
        "/documents/metrics",
        headers={"X-User-Id": USER},
        params={"project_id": project_vacio["id"]},
    )
    assert vacio.status_code == 200, vacio.text
    vacio_body = vacio.json()
    assert vacio_body["total"] == 0
    assert vacio_body["by_state"] == {}


@respx.mock
def test_internal_ids_by_project(client):
    """El endpoint interno devuelve los document_ids del proyecto (via sus
    expedientes); lista vacia si el proyecto no tiene documentos. Lo usa el
    file-service para acotar el almacenamiento por proyecto."""
    respx.post(BOOTSTRAP_URL).mock(return_value=_bootstrap_ok())

    project, doc = _make_project_with_doc(client, USER, "Con docs internos")
    vacio = client.post(
        "/projects", headers={"X-User-Id": USER}, json={"name": "Sin docs"}
    ).json()

    res = client.get("/internal/documents/ids-by-project", params={"project_id": project["id"]})
    assert res.status_code == 200, res.text
    assert res.json()["document_ids"] == [doc["id"]]

    res_vacio = client.get("/internal/documents/ids-by-project", params={"project_id": vacio["id"]})
    assert res_vacio.status_code == 200
    assert res_vacio.json()["document_ids"] == []
