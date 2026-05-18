"""Tests de integracion de actividad reciente (US-028; requieren Postgres)."""
import pytest

pytestmark = pytest.mark.integration

USER = "user-1"


def _notif(client, **over):
    payload = {
        "recipient_user_id": USER,
        "type": "cambio_estado",
        "title": "Documento movido a Observado",
        "actor_user_id": "autor",
        "document_id": "doc-1",
        "source_id": "src-1",
        "body": "Faltan firmas",
    }
    payload.update(over)
    r = client.post("/internal/collaboration/notifications", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def test_actividad_requiere_usuario(client):
    assert client.get("/collaboration/activity").status_code == 401


def test_actividad_vacia(client):
    data = client.get("/collaboration/activity", headers={"X-User-Id": USER}).json()
    assert data["items"] == []


def test_actividad_solo_del_usuario_y_desc(client):
    _notif(client, source_id="a", type="nuevo_comentario", title="Nuevo comentario")
    _notif(client, source_id="b", type="cambio_estado", title="Cambio de estado")
    _notif(client, recipient_user_id="otro", source_id="c", title="De otro")

    data = client.get("/collaboration/activity", headers={"X-User-Id": USER}).json()
    assert len(data["items"]) == 2
    assert {i["title"] for i in data["items"]} == {"Nuevo comentario", "Cambio de estado"}
    fechas = [i["created_at"] for i in data["items"]]
    assert fechas == sorted(fechas, reverse=True)
    assert data["items"][0]["document_id"] == "doc-1"
    assert data["items"][0]["type"] in {"nuevo_comentario", "cambio_estado"}


def test_actividad_respeta_limit(client):
    for n in range(5):
        _notif(client, source_id=f"s{n}", title=f"Evento {n}")
    data = client.get(
        "/collaboration/activity", headers={"X-User-Id": USER}, params={"limit": 3}
    ).json()
    assert len(data["items"]) == 3


def test_actividad_limit_invalido_422(client):
    assert (
        client.get(
            "/collaboration/activity", headers={"X-User-Id": USER}, params={"limit": 0}
        ).status_code
        == 422
    )
