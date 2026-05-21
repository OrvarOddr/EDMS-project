"""US-005: tests de otorgamiento de permisos por documento.

Mockean document-service /internal/documents/{id}/access via respx para
simular el check de manage_permissions (solo el owner / quien tiene
manage_permissions otorgado puede invocar la API).
"""
import httpx
import pytest
import respx

from tests.conftest import DOCUMENT_SERVICE_URL

pytestmark = pytest.mark.integration

DOC = "doc-1"
OWNER = "owner-1"
GRANTEE = "user-2"

ACCESS_URL_RE = rf"{DOCUMENT_SERVICE_URL}/internal/documents/{DOC}/access.*"


def _allow_manage(times: int = 1):
    return respx.get(url__regex=ACCESS_URL_RE).mock(return_value=httpx.Response(200))


def _deny_manage():
    return respx.get(url__regex=ACCESS_URL_RE).mock(return_value=httpx.Response(403))


def _grant(client, permission="view", actor=OWNER, grantee=GRANTEE, expect=201):
    r = client.post(
        f"/collaboration/documents/{DOC}/permissions",
        headers={"X-User-Id": actor},
        json={"grantee_user_id": grantee, "permission_code": permission},
    )
    assert r.status_code == expect, r.text
    return r


@respx.mock
def test_otorgar_permiso_crea_grant_activo_y_notifica(client, db_session):
    _allow_manage()
    r = _grant(client, "view")
    body = r.json()
    assert body["grantee_user_id"] == GRANTEE
    assert body["permission_code"] == "view"
    assert body["granted_by_user_id"] == OWNER

    from app.models import DocumentPermissionGrant, Notification

    grants = db_session.query(DocumentPermissionGrant).all()
    assert len(grants) == 1
    assert grants[0].is_active

    notifs = db_session.query(Notification).filter(Notification.recipient_user_id == GRANTEE).all()
    assert len(notifs) == 1
    assert notifs[0].type == "permiso_otorgado"


@respx.mock
def test_otorgar_permiso_duplicado_devuelve_409(client):
    _allow_manage()
    _grant(client, "view")
    _grant(client, "view", expect=409)


@respx.mock
def test_mismo_usuario_distinto_permiso_permite(client):
    _allow_manage()
    _grant(client, "view")
    _grant(client, "comment")  # distinto code, ok


@respx.mock
def test_permiso_invalido_devuelve_422(client):
    _allow_manage()
    _grant(client, "borrar_todo", expect=422)


def test_sin_header_devuelve_401(client):
    r = client.post(
        f"/collaboration/documents/{DOC}/permissions",
        json={"grantee_user_id": GRANTEE, "permission_code": "view"},
    )
    assert r.status_code == 401


@respx.mock
def test_sin_permiso_manage_devuelve_403(client):
    _deny_manage()
    _grant(client, "view", actor="intruso", expect=403)


@respx.mock
def test_listar_permisos_devuelve_activos(client):
    _allow_manage()
    _grant(client, "view")
    _grant(client, "download")
    r = client.get(
        f"/collaboration/documents/{DOC}/permissions",
        headers={"X-User-Id": OWNER},
    )
    assert r.status_code == 200, r.text
    codes = sorted(g["permission_code"] for g in r.json()["grants"])
    assert codes == ["download", "view"]


@respx.mock
def test_revocar_permiso(client, db_session):
    _allow_manage()
    grant_id = _grant(client, "view").json()["id"]
    r = client.delete(
        f"/collaboration/documents/{DOC}/permissions/{grant_id}",
        headers={"X-User-Id": OWNER},
    )
    assert r.status_code == 204

    from app.models import DocumentPermissionGrant

    grant = db_session.query(DocumentPermissionGrant).filter(DocumentPermissionGrant.id == grant_id).first()
    assert grant.is_active is False
    assert grant.revoked_at is not None


@respx.mock
def test_revocar_permiso_inexistente_404(client):
    _allow_manage()
    r = client.delete(
        f"/collaboration/documents/{DOC}/permissions/no-existe",
        headers={"X-User-Id": OWNER},
    )
    assert r.status_code == 404


@respx.mock
def test_endpoint_interno_devuelve_permisos_activos(client):
    _allow_manage()
    _grant(client, "view")
    _grant(client, "comment")

    r = client.get(
        f"/internal/collaboration/documents/{DOC}/permissions",
        params={"user_id": GRANTEE},
    )
    assert r.status_code == 200, r.text
    assert sorted(r.json()["permissions"]) == ["comment", "view"]


@respx.mock
def test_endpoint_interno_no_devuelve_permisos_revocados(client):
    _allow_manage()
    gid = _grant(client, "view").json()["id"]
    client.delete(
        f"/collaboration/documents/{DOC}/permissions/{gid}",
        headers={"X-User-Id": OWNER},
    )
    r = client.get(
        f"/internal/collaboration/documents/{DOC}/permissions",
        params={"user_id": GRANTEE},
    )
    assert r.status_code == 200
    assert r.json()["permissions"] == []
