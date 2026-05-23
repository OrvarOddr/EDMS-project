"""Tests de carpetas dentro de expediente (PR2).

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


def _mocks():
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
    respx.post(SUMMARIES_URL).mock(return_value=httpx.Response(200, json={"summaries": {}}))
    respx.get(url__regex=rf"{GRANTS_URL_RE}.+/permissions").mock(
        return_value=httpx.Response(200, json={"permissions": []})
    )


@respx.mock
def test_crear_y_listar_carpetas_en_expediente(client):
    _mocks()
    exp = client.post(
        "/expedients", headers={"X-User-Id": USER}, json={"name": "Expediente"}
    ).json()

    res = client.post(
        f"/expedients/{exp['id']}/folders",
        headers={"X-User-Id": USER},
        json={"name": "Contratos"},
    )
    assert res.status_code == 201
    folder = res.json()
    assert folder["expedient_id"] == exp["id"]
    assert folder["name"] == "Contratos"

    detail = client.get(f"/expedients/{exp['id']}", headers={"X-User-Id": USER}).json()
    assert any(f["id"] == folder["id"] for f in detail["folders"])


@respx.mock
def test_mover_documento_a_carpeta_y_volver_a_raiz(client):
    _mocks()
    exp = client.post(
        "/expedients", headers={"X-User-Id": USER}, json={"name": "Expediente"}
    ).json()
    folder = client.post(
        f"/expedients/{exp['id']}/folders",
        headers={"X-User-Id": USER},
        json={"name": "Anexos"},
    ).json()
    doc = client.post(
        "/documents",
        headers={"X-User-Id": USER},
        json={
            "title": "Doc",
            "document_type_id": "t1",
            "description": "d",
            "expedient_id": exp["id"],
        },
    ).json()

    # Mover a carpeta.
    moved = client.patch(
        f"/documents/{doc['id']}/folder",
        headers={"X-User-Id": USER},
        json={"folder_id": folder["id"]},
    )
    assert moved.status_code == 200
    assert moved.json()["folder_id"] == folder["id"]

    detail = client.get(f"/expedients/{exp['id']}", headers={"X-User-Id": USER}).json()
    in_folder = [d for d in detail["documents"] if d["folder_id"] == folder["id"]]
    assert any(d["id"] == doc["id"] for d in in_folder)

    # Sacar a raíz (folder_id=null).
    out = client.patch(
        f"/documents/{doc['id']}/folder",
        headers={"X-User-Id": USER},
        json={"folder_id": None},
    )
    assert out.status_code == 200
    assert out.json()["folder_id"] is None


@respx.mock
def test_borrar_carpeta_devuelve_documentos_a_raiz(client):
    _mocks()
    exp = client.post(
        "/expedients", headers={"X-User-Id": USER}, json={"name": "Exp"}
    ).json()
    folder = client.post(
        f"/expedients/{exp['id']}/folders",
        headers={"X-User-Id": USER},
        json={"name": "Tmp"},
    ).json()
    doc = client.post(
        "/documents",
        headers={"X-User-Id": USER},
        json={
            "title": "Doc",
            "document_type_id": "t1",
            "description": "d",
            "expedient_id": exp["id"],
        },
    ).json()
    client.patch(
        f"/documents/{doc['id']}/folder",
        headers={"X-User-Id": USER},
        json={"folder_id": folder["id"]},
    )

    res = client.delete(
        f"/expedients/{exp['id']}/folders/{folder['id']}",
        headers={"X-User-Id": USER},
    )
    assert res.status_code == 204

    detail = client.get(f"/expedients/{exp['id']}", headers={"X-User-Id": USER}).json()
    assert not detail["folders"]
    target = next(d for d in detail["documents"] if d["id"] == doc["id"])
    assert target["folder_id"] is None


@respx.mock
def test_solo_creador_o_admin_puede_borrar_carpeta(client):
    _mocks()
    exp = client.post(
        "/expedients", headers={"X-User-Id": USER}, json={"name": "Exp"}
    ).json()
    folder = client.post(
        f"/expedients/{exp['id']}/folders",
        headers={"X-User-Id": USER},
        json={"name": "Restringida"},
    ).json()

    forbidden = client.delete(
        f"/expedients/{exp['id']}/folders/{folder['id']}",
        headers={"X-User-Id": OTHER},
    )
    assert forbidden.status_code == 403

    admin_ok = client.delete(
        f"/expedients/{exp['id']}/folders/{folder['id']}",
        headers={"X-User-Id": OTHER, "X-User-Roles": "admin"},
    )
    assert admin_ok.status_code == 204


@respx.mock
def test_mover_a_carpeta_de_otro_expediente_devuelve_404(client):
    _mocks()
    exp_a = client.post(
        "/expedients", headers={"X-User-Id": USER}, json={"name": "A"}
    ).json()
    exp_b = client.post(
        "/expedients", headers={"X-User-Id": USER}, json={"name": "B"}
    ).json()
    folder_b = client.post(
        f"/expedients/{exp_b['id']}/folders",
        headers={"X-User-Id": USER},
        json={"name": "B-folder"},
    ).json()
    doc_a = client.post(
        "/documents",
        headers={"X-User-Id": USER},
        json={
            "title": "Doc",
            "document_type_id": "t1",
            "description": "d",
            "expedient_id": exp_a["id"],
        },
    ).json()

    res = client.patch(
        f"/documents/{doc_a['id']}/folder",
        headers={"X-User-Id": USER},
        json={"folder_id": folder_b["id"]},
    )
    assert res.status_code == 404


@respx.mock
def test_reasignar_expediente_resetea_folder_id(client):
    _mocks()
    exp_a = client.post(
        "/expedients", headers={"X-User-Id": USER}, json={"name": "A"}
    ).json()
    exp_b = client.post(
        "/expedients", headers={"X-User-Id": USER}, json={"name": "B"}
    ).json()
    folder_a = client.post(
        f"/expedients/{exp_a['id']}/folders",
        headers={"X-User-Id": USER},
        json={"name": "AFold"},
    ).json()
    doc = client.post(
        "/documents",
        headers={"X-User-Id": USER},
        json={
            "title": "Doc",
            "document_type_id": "t1",
            "description": "d",
            "expedient_id": exp_a["id"],
        },
    ).json()
    client.patch(
        f"/documents/{doc['id']}/folder",
        headers={"X-User-Id": USER},
        json={"folder_id": folder_a["id"]},
    )

    # Mover via attach a expB: folder_id debe quedar en null.
    client.post(
        f"/expedients/{exp_b['id']}/documents",
        headers={"X-User-Id": USER},
        json={"document_ids": [doc["id"]]},
    )
    listed = client.get("/documents", headers={"X-User-Id": USER}).json()
    target = next(d for d in listed if d["id"] == doc["id"])
    assert target["expedient_id"] == exp_b["id"]
    assert target["folder_id"] is None
