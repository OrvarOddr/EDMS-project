"""Tests de integracion de /users y /roles (requieren Postgres; corren en CI)."""
import pytest

from tests.conftest import auth_headers

pytestmark = pytest.mark.integration


def _role_id(client, token, code):
    roles = client.get("/roles", headers=auth_headers(token)).json()
    return next(r["id"] for r in roles if r["code"] == code)


def test_listar_roles_sembrados(client, admin_token):
    roles = client.get("/roles", headers=auth_headers(admin_token)).json()
    codes = {r["code"] for r in roles}
    assert {"admin", "coordinador", "revisor", "colaborador", "solo_lectura"} <= codes


def test_crear_usuario_como_admin(client, admin_token):
    role_id = _role_id(client, admin_token, "revisor")
    r = client.post(
        "/users",
        headers=auth_headers(admin_token),
        json={
            "email": "nuevo@edms.dev",
            "password": "clave-segura-123",
            "first_name": "Nuevo",
            "last_name": "Usuario",
            "role_id": role_id,
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["email"] == "nuevo@edms.dev"
    assert body["roles"] == ["revisor"]
    assert body["is_superuser"] is False


def test_crear_usuario_email_duplicado(client, admin_token):
    role_id = _role_id(client, admin_token, "colaborador")
    payload = {
        "email": "dup@edms.dev",
        "password": "clave-segura-123",
        "first_name": "Du",
        "last_name": "Plicado",
        "role_id": role_id,
    }
    assert client.post("/users", headers=auth_headers(admin_token), json=payload).status_code == 201
    assert client.post("/users", headers=auth_headers(admin_token), json=payload).status_code == 409


def test_crear_usuario_rol_inexistente(client, admin_token):
    r = client.post(
        "/users",
        headers=auth_headers(admin_token),
        json={
            "email": "x@edms.dev",
            "password": "clave-segura-123",
            "first_name": "X",
            "last_name": "Y",
            "role_id": "rol-que-no-existe",
        },
    )
    assert r.status_code == 404


def test_usuario_no_superuser_no_puede_crear(client, admin_token):
    role_id = _role_id(client, admin_token, "colaborador")
    client.post(
        "/users",
        headers=auth_headers(admin_token),
        json={
            "email": "normal@edms.dev",
            "password": "clave-segura-123",
            "first_name": "No",
            "last_name": "Admin",
            "role_id": role_id,
        },
    )
    token = client.post(
        "/auth/login", json={"email": "normal@edms.dev", "password": "clave-segura-123"}
    ).json()["access_token"]

    r = client.post(
        "/users",
        headers=auth_headers(token),
        json={
            "email": "otro@edms.dev",
            "password": "clave-segura-123",
            "first_name": "O",
            "last_name": "T",
            "role_id": role_id,
        },
    )
    assert r.status_code == 403


def test_sin_token_devuelve_403(client):
    assert client.get("/users").status_code == 403


def test_asignar_rol_cambia_rol_y_superuser(client, admin_token):
    colaborador = _role_id(client, admin_token, "colaborador")
    admin_role = _role_id(client, admin_token, "admin")
    created = client.post(
        "/users",
        headers=auth_headers(admin_token),
        json={
            "email": "asciende@edms.dev",
            "password": "clave-segura-123",
            "first_name": "As",
            "last_name": "Ciende",
            "role_id": colaborador,
        },
    ).json()

    r = client.post(
        "/roles/assign",
        headers=auth_headers(admin_token),
        json={"user_id": created["id"], "role_id": admin_role},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["roles"] == ["admin"]
    assert body["is_superuser"] is True
