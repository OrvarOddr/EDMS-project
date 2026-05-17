"""Tests de integracion de /auth (requieren Postgres; corren en CI)."""
import pytest

from tests.conftest import ADMIN_EMAIL, ADMIN_PASSWORD, auth_headers

pytestmark = pytest.mark.integration


def test_login_ok_devuelve_tokens(client):
    r = client.post("/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["token_type"] == "bearer"


def test_login_credenciales_invalidas(client):
    r = client.post("/auth/login", json={"email": ADMIN_EMAIL, "password": "incorrecta"})
    assert r.status_code == 401


def test_login_cuenta_inactiva(client, admin_token):
    roles = client.get("/roles", headers=auth_headers(admin_token)).json()
    role_id = next(r["id"] for r in roles if r["code"] == "colaborador")
    client.post(
        "/users",
        headers=auth_headers(admin_token),
        json={
            "email": "inactivo@edms.dev",
            "password": "clave-segura-123",
            "first_name": "In",
            "last_name": "Activo",
            "role_id": role_id,
            "status": "inactive",
        },
    )
    r = client.post("/auth/login", json={"email": "inactivo@edms.dev", "password": "clave-segura-123"})
    assert r.status_code == 403


def test_login_rate_limit_tras_5_intentos(client):
    for _ in range(5):
        client.post("/auth/login", json={"email": ADMIN_EMAIL, "password": "mala"})
    r = client.post("/auth/login", json={"email": ADMIN_EMAIL, "password": "mala"})
    assert r.status_code == 429


def test_refresh_rota_y_revoca_el_anterior(client):
    login = client.post(
        "/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    ).json()
    old_refresh = login["refresh_token"]

    rotated = client.post("/auth/refresh", json={"refresh_token": old_refresh})
    assert rotated.status_code == 200
    assert rotated.json()["refresh_token"] != old_refresh

    reuse = client.post("/auth/refresh", json={"refresh_token": old_refresh})
    assert reuse.status_code == 401


def test_logout_invalida_el_refresh(client):
    login = client.post(
        "/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    ).json()
    refresh = login["refresh_token"]

    assert client.post("/auth/logout", json={"refresh_token": refresh}).status_code == 204
    assert client.post("/auth/refresh", json={"refresh_token": refresh}).status_code == 401
