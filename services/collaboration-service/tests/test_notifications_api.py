"""Tests de integracion de notificaciones (requieren Postgres; corren en CI)."""
import pytest

pytestmark = pytest.mark.integration

USER = "user-1"


def _create(client, **over):
    payload = {
        "recipient_user_id": USER,
        "type": "nuevo_comentario",
        "title": "Nuevo comentario",
        "actor_user_id": "autor",
        "document_id": "doc-1",
        "document_name": "Documento de prueba",
        "source_id": "src-1",
        "body": "hola",
    }
    payload.update(over)
    return client.post("/internal/collaboration/notifications", json=payload)


def test_crear_notificacion_interna(client):
    r = _create(client)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["recipient_user_id"] == USER
    assert data["is_read"] is False
    assert data["document_name"] == "Documento de prueba"


def test_dedup_por_source_id(client):
    first = _create(client).json()
    second = _create(client).json()
    assert first["id"] == second["id"]

    listed = client.get(
        "/collaboration/notifications", headers={"X-User-Id": USER}
    ).json()
    assert len(listed["items"]) == 1


def test_listar_requiere_usuario(client):
    assert client.get("/collaboration/notifications").status_code == 401


def test_listar_devuelve_no_leidas(client):
    _create(client, source_id="a")
    _create(client, source_id="b")
    data = client.get(
        "/collaboration/notifications", headers={"X-User-Id": USER}
    ).json()
    assert data["unread_count"] == 2
    assert len(data["items"]) == 2


def test_marcar_leida(client):
    nid = _create(client).json()["id"]
    sin_user = client.post(f"/collaboration/notifications/{nid}/read")
    assert sin_user.status_code == 401

    no_existe = client.post(
        "/collaboration/notifications/inexistente/read", headers={"X-User-Id": USER}
    )
    assert no_existe.status_code == 404

    ok = client.post(
        f"/collaboration/notifications/{nid}/read", headers={"X-User-Id": USER}
    )
    assert ok.status_code == 200
    assert ok.json()["is_read"] is True

    data = client.get(
        "/collaboration/notifications", headers={"X-User-Id": USER}
    ).json()
    assert data["unread_count"] == 0


def test_marcar_todas_leidas(client):
    _create(client, source_id="a")
    _create(client, source_id="b")
    r = client.post(
        "/collaboration/notifications/read-all", headers={"X-User-Id": USER}
    )
    assert r.status_code == 204
    data = client.get(
        "/collaboration/notifications", headers={"X-User-Id": USER}
    ).json()
    assert data["unread_count"] == 0
