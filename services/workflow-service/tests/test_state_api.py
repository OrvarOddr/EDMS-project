"""Tests de integracion del cambio de estado (requieren Postgres; corren en CI)."""
import httpx
import pytest
import respx

pytestmark = pytest.mark.integration

DOC = "doc-1"
USER = "user-1"
NOTIF_URL = "http://collaboration-service:8004/internal/collaboration/notifications"


def _bootstrap(client, document_id=DOC, creator=USER, assignee=None):
    payload = {"document_id": document_id, "created_by_user_id": creator}
    if assignee:
        payload["assignee_user_id"] = assignee
    r = client.post("/internal/workflow/documents/bootstrap", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def test_bootstrap_crea_estado_inicial_y_encargado(client):
    body = _bootstrap(client)
    assert body["state_code"] == "borrador"
    assert body["assignee_user_id"] == USER
    assert body["assignment_role_code"] == "encargado"


def test_cambio_de_estado_valido_registra_historial(client):
    _bootstrap(client)
    r = client.patch(
        f"/workflow/documents/{DOC}/state",
        headers={"X-User-Id": USER},
        json={"new_state_code": "en_revision"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["previous_state_code"] == "borrador"
    assert r.json()["new_state_code"] == "en_revision"

    history = client.get(f"/internal/workflow/documents/{DOC}/history").json()
    estados = [h["body"] for h in history if h["action"] == "state_change"]
    assert "en_revision" in estados and "borrador" in estados


def test_transicion_no_permitida_devuelve_409(client):
    _bootstrap(client)
    r = client.patch(
        f"/workflow/documents/{DOC}/state",
        headers={"X-User-Id": USER},
        json={"new_state_code": "archivado"},
    )
    assert r.status_code == 409


def test_estado_invalido_devuelve_422(client):
    _bootstrap(client)
    r = client.patch(
        f"/workflow/documents/{DOC}/state",
        headers={"X-User-Id": USER},
        json={"new_state_code": "inexistente"},
    )
    assert r.status_code == 422


def test_documento_sin_workflow_devuelve_404(client):
    r = client.patch(
        "/workflow/documents/sin-workflow/state",
        headers={"X-User-Id": USER},
        json={"new_state_code": "en_revision"},
    )
    assert r.status_code == 404


def test_sin_header_usuario_devuelve_401(client):
    _bootstrap(client)
    r = client.patch(
        f"/workflow/documents/{DOC}/state",
        json={"new_state_code": "en_revision"},
    )
    assert r.status_code == 401


def test_usuario_sin_asignacion_activa_devuelve_403(client):
    _bootstrap(client)
    r = client.patch(
        f"/workflow/documents/{DOC}/state",
        headers={"X-User-Id": "intruso"},
        json={"new_state_code": "en_revision"},
    )
    assert r.status_code == 403


def test_observado_exige_comentario(client):
    _bootstrap(client)
    sin = client.patch(
        f"/workflow/documents/{DOC}/state",
        headers={"X-User-Id": USER},
        json={"new_state_code": "observado"},
    )
    assert sin.status_code == 422

    con = client.patch(
        f"/workflow/documents/{DOC}/state",
        headers={"X-User-Id": USER},
        json={"new_state_code": "observado", "comment": "Faltan firmas"},
    )
    assert con.status_code == 200, con.text

    history = client.get(f"/internal/workflow/documents/{DOC}/history").json()
    observado = next(h for h in history if h["action"] == "state_change" and h["body"] == "observado")
    assert observado["note"] == "Faltan firmas"


@respx.mock
def test_cambio_de_estado_notifica_a_otros_asignados(client, db_session):
    route = respx.post(NOTIF_URL).mock(return_value=httpx.Response(201))
    _bootstrap(client)

    from app.models import DocumentAssignment

    db_session.add(
        DocumentAssignment(
            document_id=DOC,
            user_id="user-2",
            role_code="revisor",
            assigned_by_user_id=USER,
        )
    )
    db_session.commit()

    r = client.patch(
        f"/workflow/documents/{DOC}/state",
        headers={"X-User-Id": USER},
        json={"new_state_code": "en_revision"},
    )
    assert r.status_code == 200, r.text
    assert route.called
    sent = route.calls.last.request
    assert b"user-2" in sent.content
