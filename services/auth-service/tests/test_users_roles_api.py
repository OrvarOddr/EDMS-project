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


def test_crear_usuarios_seguidos_minimiza_colisiones(client, admin_token):
    """Con seleccion 'menos usado', N usuarios <= |paleta| no deben repetir color."""
    from app.routers.users import AVATAR_PALETTE

    role_id = _role_id(client, admin_token, "colaborador")
    colores = []
    # Creamos justo |paleta|-1 usuarios extra (mas el admin sembrado ya tiene uno):
    # como elegimos siempre el menos usado y partimos sin colisiones, cada nuevo
    # usuario deberia caer en un color distinto a los ya usados.
    cupos = len(AVATAR_PALETTE) - 1
    for i in range(cupos):
        r = client.post(
            "/users",
            headers=auth_headers(admin_token),
            json={
                "email": f"sin-colision-{i}@edms.dev",
                "password": "clave-segura-123",
                "first_name": f"User{i}",
                "last_name": "Colision",
                "role_id": role_id,
            },
        )
        assert r.status_code == 201, r.text
        colores.append(r.json()["color"])

    # Verificamos: la frecuencia maxima de cualquier color en la lista de nuevos
    # usuarios no supera ceil(cupos / |paleta|) = 1 (porque cupos < |paleta|).
    from collections import Counter
    counts = Counter(colores)
    assert max(counts.values()) <= 1, f"Hubo colisiones evitables: {counts}"


def test_crear_usuario_asigna_color_de_paleta(client, admin_token):
    """El color de avatar se asigna al crear y se devuelve en la response."""
    from app.routers.users import AVATAR_PALETTE

    role_id = _role_id(client, admin_token, "colaborador")
    r = client.post(
        "/users",
        headers=auth_headers(admin_token),
        json={
            "email": "concolor@edms.dev",
            "password": "clave-segura-123",
            "first_name": "Con",
            "last_name": "Color",
            "role_id": role_id,
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["color"] in AVATAR_PALETTE


def test_listado_usuarios_devuelve_color(client, admin_token):
    """GET /users incluye color para cada usuario."""
    users = client.get("/users", headers=auth_headers(admin_token)).json()
    assert users, "no hay usuarios sembrados"
    assert all(u["color"] for u in users), "algun usuario quedo sin color asignado"


def test_color_se_conserva_entre_llamadas(client, admin_token):
    """Una vez asignado, el color del usuario no cambia entre llamadas."""
    role_id = _role_id(client, admin_token, "revisor")
    created = client.post(
        "/users",
        headers=auth_headers(admin_token),
        json={
            "email": "estable@edms.dev",
            "password": "clave-segura-123",
            "first_name": "Es",
            "last_name": "Table",
            "role_id": role_id,
        },
    ).json()
    color = created["color"]
    listado = client.get("/users", headers=auth_headers(admin_token)).json()
    encontrado = next(u for u in listado if u["id"] == created["id"])
    assert encontrado["color"] == color


def test_usuario_existente_sin_color_recibe_color_lazy(client, admin_token, db_session):
    """Usuarios pre-existentes (color=None en DB) reciben uno en la primera lectura."""
    from app.models import User

    user = db_session.query(User).filter(User.email == "admin@edms.dev").first()
    assert user is not None
    # Forzamos color=None para simular usuario pre-feature.
    user.color = None
    db_session.commit()

    me_first = client.get("/users/me", headers=auth_headers(admin_token)).json()
    assert me_first["color"] is not None

    db_session.expire_all()
    user_after = db_session.query(User).filter(User.email == "admin@edms.dev").first()
    assert user_after.color == me_first["color"], "el color no se persistio en la fila"
