"""US-019: gestion de asignaciones no-owner (revisor/aprobador/lector).

Endpoints:
- POST   /workflow/documents/{id}/assignments      -> agrega
- DELETE /workflow/documents/{id}/assignments/{aid} -> quita (soft)
- PATCH  /workflow/documents/{id}/assignments/{aid} -> cambia rol

Requiere Postgres (lo provee CI). collaboration-service se mockea con respx.
"""
import httpx
import pytest
import respx

pytestmark = pytest.mark.integration

DOC = "doc-1"
OWNER = "user-owner"
OTHER = "user-other"
THIRD = "user-third"
NOTIF_URL = "http://collaboration-service:8004/internal/collaboration/notifications"


def _bootstrap(client, document_id=DOC, owner=OWNER):
    r = client.post(
        "/internal/workflow/documents/bootstrap",
        json={"document_id": document_id, "created_by_user_id": owner},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _list_assignments(client, document_id=DOC):
    r = client.get(f"/internal/workflow/documents/{document_id}/assignments")
    assert r.status_code == 200, r.text
    return r.json()


def _add(client, role, user_id, actor=OWNER, document_id=DOC, expect=201):
    r = client.post(
        f"/workflow/documents/{document_id}/assignments",
        headers={"X-User-Id": actor},
        json={"user_id": user_id, "role_code": role},
    )
    assert r.status_code == expect, r.text
    return r


@respx.mock
def test_agregar_asignacion_no_owner_crea_y_notifica(client):
    route = respx.post(NOTIF_URL).mock(return_value=httpx.Response(201))
    _bootstrap(client)
    r = _add(client, "revisor", OTHER)
    body = r.json()
    assert body["user_id"] == OTHER
    assert body["role_code"] == "revisor"
    assert body["assigned_by_user_id"] == OWNER

    activos = _list_assignments(client)
    roles = sorted((a["user_id"], a["role_code"]) for a in activos)
    assert roles == sorted([(OWNER, "encargado"), (OTHER, "revisor")])
    assert route.called


@respx.mock
def test_agregar_asignacion_no_notifica_a_si_mismo(client):
    route = respx.post(NOTIF_URL).mock(return_value=httpx.Response(201))
    _bootstrap(client)
    _add(client, "lector", OWNER)  # owner se asigna a si mismo otro rol
    # no se manda notificacion cuando recipient == actor
    assert not route.called


def test_agregar_asignacion_duplicada_devuelve_409(client):
    _bootstrap(client)
    _add(client, "revisor", OTHER)
    _add(client, "revisor", OTHER, expect=409)


def test_agregar_mismo_usuario_distinto_rol_permite(client):
    _bootstrap(client)
    _add(client, "revisor", OTHER)
    _add(client, "aprobador", OTHER)  # mismo usuario, otro rol -> ok


def test_agregar_rol_encargado_devuelve_422(client):
    _bootstrap(client)
    _add(client, "encargado", OTHER, expect=422)


def test_agregar_rol_invalido_devuelve_422(client):
    _bootstrap(client)
    _add(client, "supervisor", OTHER, expect=422)


def test_agregar_sin_ser_encargado_devuelve_403(client):
    _bootstrap(client)
    _add(client, "revisor", THIRD, actor=OTHER, expect=403)


def test_agregar_sin_header_devuelve_401(client):
    _bootstrap(client)
    r = client.post(
        f"/workflow/documents/{DOC}/assignments",
        json={"user_id": OTHER, "role_code": "revisor"},
    )
    assert r.status_code == 401


def test_agregar_sin_workflow_devuelve_404(client):
    r = client.post(
        f"/workflow/documents/{DOC}/assignments",
        headers={"X-User-Id": OWNER},
        json={"user_id": OTHER, "role_code": "revisor"},
    )
    assert r.status_code == 404


@respx.mock
def test_quitar_asignacion_la_revoca(client):
    respx.post(NOTIF_URL).mock(return_value=httpx.Response(201))
    _bootstrap(client)
    aid = _add(client, "revisor", OTHER).json()["id"]

    r = client.delete(
        f"/workflow/documents/{DOC}/assignments/{aid}",
        headers={"X-User-Id": OWNER},
    )
    assert r.status_code == 204

    activos = _list_assignments(client)
    assert all(a["user_id"] != OTHER for a in activos)


@respx.mock
def test_quitar_asignacion_encargado_devuelve_409(client):
    respx.post(NOTIF_URL).mock(return_value=httpx.Response(201))
    _bootstrap(client)
    activos = _list_assignments(client)
    encargado = next(a for a in activos if a["role_code"] == "encargado")

    r = client.delete(
        f"/workflow/documents/{DOC}/assignments/{encargado['id']}",
        headers={"X-User-Id": OWNER},
    )
    assert r.status_code == 409


def test_quitar_asignacion_inexistente_devuelve_404(client):
    _bootstrap(client)
    r = client.delete(
        f"/workflow/documents/{DOC}/assignments/asignacion-inexistente",
        headers={"X-User-Id": OWNER},
    )
    assert r.status_code == 404


@respx.mock
def test_quitar_sin_ser_encargado_devuelve_403(client):
    respx.post(NOTIF_URL).mock(return_value=httpx.Response(201))
    _bootstrap(client)
    aid = _add(client, "revisor", OTHER).json()["id"]

    r = client.delete(
        f"/workflow/documents/{DOC}/assignments/{aid}",
        headers={"X-User-Id": OTHER},
    )
    assert r.status_code == 403


@respx.mock
def test_cambiar_rol_revoca_anterior_y_crea_nueva(client):
    respx.post(NOTIF_URL).mock(return_value=httpx.Response(201))
    _bootstrap(client)
    aid = _add(client, "revisor", OTHER).json()["id"]

    r = client.patch(
        f"/workflow/documents/{DOC}/assignments/{aid}",
        headers={"X-User-Id": OWNER},
        json={"role_code": "aprobador"},
    )
    assert r.status_code == 200, r.text
    nuevo = r.json()
    assert nuevo["role_code"] == "aprobador"
    assert nuevo["id"] != aid

    activos = _list_assignments(client)
    ids = {(a["user_id"], a["role_code"]) for a in activos}
    assert (OTHER, "aprobador") in ids
    assert (OTHER, "revisor") not in ids


@respx.mock
def test_cambiar_rol_a_encargado_devuelve_422(client):
    respx.post(NOTIF_URL).mock(return_value=httpx.Response(201))
    _bootstrap(client)
    aid = _add(client, "revisor", OTHER).json()["id"]
    r = client.patch(
        f"/workflow/documents/{DOC}/assignments/{aid}",
        headers={"X-User-Id": OWNER},
        json={"role_code": "encargado"},
    )
    assert r.status_code == 422


@respx.mock
def test_cambiar_rol_duplicado_devuelve_409(client):
    respx.post(NOTIF_URL).mock(return_value=httpx.Response(201))
    _bootstrap(client)
    aid = _add(client, "revisor", OTHER).json()["id"]
    _add(client, "aprobador", OTHER)  # ya existe aprobador para OTHER
    r = client.patch(
        f"/workflow/documents/{DOC}/assignments/{aid}",
        headers={"X-User-Id": OWNER},
        json={"role_code": "aprobador"},
    )
    assert r.status_code == 409


@respx.mock
def test_cambiar_rol_al_mismo_es_noop(client):
    respx.post(NOTIF_URL).mock(return_value=httpx.Response(201))
    _bootstrap(client)
    aid = _add(client, "revisor", OTHER).json()["id"]
    r = client.patch(
        f"/workflow/documents/{DOC}/assignments/{aid}",
        headers={"X-User-Id": OWNER},
        json={"role_code": "revisor"},
    )
    assert r.status_code == 200
    assert r.json()["id"] == aid  # mismo registro


def test_cambiar_rol_sin_ser_encargado_devuelve_403(client):
    _bootstrap(client)
    # creamos asignacion como owner
    _bootstrap_then_add = client.post(
        f"/workflow/documents/{DOC}/assignments",
        headers={"X-User-Id": OWNER},
        json={"user_id": OTHER, "role_code": "revisor"},
    )
    assert _bootstrap_then_add.status_code == 201
    aid = _bootstrap_then_add.json()["id"]
    r = client.patch(
        f"/workflow/documents/{DOC}/assignments/{aid}",
        headers={"X-User-Id": OTHER},
        json={"role_code": "aprobador"},
    )
    assert r.status_code == 403


@respx.mock
def test_historial_incluye_alta_y_baja_de_asignacion(client):
    respx.post(NOTIF_URL).mock(return_value=httpx.Response(201))
    _bootstrap(client)
    aid = _add(client, "revisor", OTHER).json()["id"]
    client.delete(
        f"/workflow/documents/{DOC}/assignments/{aid}",
        headers={"X-User-Id": OWNER},
    )

    history = client.get(f"/internal/workflow/documents/{DOC}/history").json()
    actions = [(h["action"], h.get("body"), h.get("note")) for h in history]
    assert ("assignment_added", OTHER, "revisor") in actions
    assert ("assignment_removed", OTHER, "revisor") in actions
