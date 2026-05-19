"""US-034: vencimientos proximos (requiere Postgres; corre en CI).

workflow-service y collaboration-service se mockean con respx.
"""
from datetime import datetime, timedelta, timezone

import httpx
import pytest
import respx

from tests.conftest import COLLABORATION_SERVICE_URL, WORKFLOW_SERVICE_URL

pytestmark = pytest.mark.integration

USER = "user-1"
BOOTSTRAP_URL = f"{WORKFLOW_SERVICE_URL}/internal/workflow/documents/bootstrap"
SUMMARIES_URL = f"{WORKFLOW_SERVICE_URL}/internal/workflow/documents/batch-summaries"
NOTIF_URL = f"{COLLABORATION_SERVICE_URL}/internal/collaboration/notifications"

BASE_META = {
    "title": "x",
    "document_type_id": "t1",
    "description": "d",
    "confidentiality_level": "publico_interno",
}


def _mocks():
    respx.post(BOOTSTRAP_URL).mock(
        return_value=httpx.Response(
            201,
            json={"document_id": "x", "state_code": "borrador", "assignee_user_id": USER, "assignment_role_code": "encargado"},
        )
    )
    respx.post(SUMMARIES_URL).mock(return_value=httpx.Response(200, json={"summaries": {}}))
    respx.get(url__regex=rf"{WORKFLOW_SERVICE_URL}/internal/workflow/documents/.+/assignments").mock(
        return_value=httpx.Response(200, json=[{"user_id": USER}])
    )
    respx.post(NOTIF_URL).mock(return_value=httpx.Response(201))


def _create(client, title):
    r = client.post("/documents", headers={"X-User-Id": USER}, json={"title": title, "document_type_id": "t1", "description": "d"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _set_due(client, doc_id, iso_date):
    r = client.patch(
        f"/documents/{doc_id}/metadata",
        headers={"X-User-Id": USER},
        json={**BASE_META, "due_date": iso_date},
    )
    assert r.status_code == 200, r.text


@respx.mock
def test_due_soon_filtra_y_ordena_por_proximidad(client):
    _mocks()
    today = datetime.now(timezone.utc).date()
    pronto = _create(client, "Vence pronto")
    medio = _create(client, "Vence en una semana")
    lejos = _create(client, "Vence lejos")
    sin = _create(client, "Sin fecha")

    _set_due(client, medio, (today + timedelta(days=7)).isoformat())
    _set_due(client, pronto, (today + timedelta(days=2)).isoformat())
    _set_due(client, lejos, (today + timedelta(days=90)).isoformat())

    r = client.get("/documents", headers={"X-User-Id": USER}, params={"due_within_days": 14})
    assert r.status_code == 200, r.text
    ids = [d["id"] for d in r.json()]
    # solo los que vencen dentro de 14 dias, ordenados por proximidad
    assert ids == [pronto, medio]
    assert lejos not in ids and sin not in ids


@respx.mock
def test_due_soon_devuelve_todos_por_proximidad_sin_tope(client):
    _mocks()
    today = datetime.now(timezone.utc).date()
    cercano = _create(client, "Cercano")
    lejano = _create(client, "Lejano 2027")
    sin = _create(client, "Sin fecha due_soon")

    _set_due(client, lejano, (today + timedelta(days=400)).isoformat())
    _set_due(client, cercano, (today + timedelta(days=10)).isoformat())

    r = client.get("/documents", headers={"X-User-Id": USER}, params={"due_soon": "true"})
    assert r.status_code == 200, r.text
    ids = [d["id"] for d in r.json()]
    # incluye el lejano (sin tope de dias) y ordena por proximidad
    assert ids == [cercano, lejano]
    assert sin not in ids


@respx.mock
def test_due_soon_incluye_vencidos(client):
    _mocks()
    today = datetime.now(timezone.utc).date()
    vencido = _create(client, "Ya vencio")
    _set_due(client, vencido, (today - timedelta(days=3)).isoformat())

    r = client.get("/documents", headers={"X-User-Id": USER}, params={"due_within_days": 7})
    assert r.status_code == 200
    assert vencido in [d["id"] for d in r.json()]


@respx.mock
def test_due_soon_vacio_si_no_hay(client):
    _mocks()
    _create(client, "Sin vencimiento")
    r = client.get("/documents", headers={"X-User-Id": USER}, params={"due_within_days": 7})
    assert r.status_code == 200
    assert r.json() == []


@respx.mock
def test_due_within_days_invalido_422(client):
    _mocks()
    assert client.get("/documents", headers={"X-User-Id": USER}, params={"due_within_days": 0}).status_code == 422
