"""Tests de integracion de etiquetas (requieren Postgres; corren en CI)."""
import httpx
import pytest
import respx

from tests.conftest import WORKFLOW_SERVICE_URL

pytestmark = pytest.mark.integration

USER = "user-1"
BOOTSTRAP_URL = f"{WORKFLOW_SERVICE_URL}/internal/workflow/documents/bootstrap"


def test_listar_tags_requiere_usuario(client):
    assert client.get("/tags").status_code == 401


def test_crear_y_listar_tag(client):
    created = client.post(
        "/tags", headers={"X-User-Id": USER}, json={"label": "Urgente", "color": "#f00"}
    )
    assert created.status_code == 201, created.text
    listed = client.get("/tags", headers={"X-User-Id": USER}).json()
    assert any(t["label"] == "Urgente" for t in listed)


@respx.mock
def test_asignar_y_quitar_tag_de_documento(client):
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
    doc = client.post(
        "/documents",
        headers={"X-User-Id": USER},
        json={"title": "Doc", "document_type_id": "t1", "description": "d"},
    ).json()
    tag = client.post(
        "/tags", headers={"X-User-Id": USER}, json={"label": "Legal", "color": "#00f"}
    ).json()

    assign = client.post(
        f"/documents/{doc['id']}/tags/{tag['id']}", headers={"X-User-Id": USER}
    )
    assert assign.status_code == 204

    tags = client.get(
        f"/documents/{doc['id']}/tags", headers={"X-User-Id": USER}
    ).json()
    assert [t["id"] for t in tags] == [tag["id"]]

    remove = client.delete(
        f"/documents/{doc['id']}/tags/{tag['id']}", headers={"X-User-Id": USER}
    )
    assert remove.status_code == 204
    assert client.get(
        f"/documents/{doc['id']}/tags", headers={"X-User-Id": USER}
    ).json() == []
