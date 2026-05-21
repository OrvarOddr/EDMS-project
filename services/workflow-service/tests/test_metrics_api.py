"""US-027: agregados de metricas del workflow."""
import httpx
import pytest
import respx

pytestmark = pytest.mark.integration

NOTIF_URL = "http://collaboration-service:8004/internal/collaboration/notifications"


def _bootstrap(client, document_id, creator):
    r = client.post(
        "/internal/workflow/documents/bootstrap",
        json={"document_id": document_id, "created_by_user_id": creator},
    )
    assert r.status_code == 201, r.text


def _set_state(client, document_id, user, new_state, comment=None):
    body = {"new_state_code": new_state}
    if comment is not None:
        body["comment"] = comment
    r = client.patch(
        f"/workflow/documents/{document_id}/state",
        headers={"X-User-Id": user},
        json=body,
    )
    assert r.status_code == 200, r.text


@respx.mock
def test_metrics_aggregates_cuenta_por_estado_y_encargado(client):
    respx.post(NOTIF_URL).mock(return_value=httpx.Response(201))
    _bootstrap(client, "doc-a", "alice")
    _bootstrap(client, "doc-b", "alice")
    _bootstrap(client, "doc-c", "bob")
    _set_state(client, "doc-a", "alice", "en_revision")
    _set_state(client, "doc-c", "bob", "en_revision")

    r = client.get("/internal/workflow/documents/metrics/aggregates")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["by_state"].get("en_revision") == 2
    assert body["by_state"].get("borrador") == 1
    assert body["by_owner"].get("alice") == 2
    assert body["by_owner"].get("bob") == 1


def test_metrics_aggregates_vacios_si_no_hay_workflows(client):
    r = client.get("/internal/workflow/documents/metrics/aggregates")
    assert r.status_code == 200
    assert r.json() == {"by_state": {}, "by_owner": {}}
