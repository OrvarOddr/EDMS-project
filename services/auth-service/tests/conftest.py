"""Bootstrap de entorno y fixtures para tests de auth-service.

Fija variables dummy ANTES de que pytest importe `app.*`, porque
`app.config.Settings()` se evalua al importar y exige estas variables.
`setdefault` no pisa valores reales que CI inyecte.
"""
import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:postgres@localhost:5432/test_db",
)
os.environ.setdefault(
    "JWT_SECRET_KEY",
    "test-jwt-secret-key-with-at-least-32-characters",
)
os.environ.setdefault("BOOTSTRAP_ADMIN_EMAIL", "admin@edms.dev")
os.environ.setdefault("BOOTSTRAP_ADMIN_PASSWORD", "test-admin-pass-123456")

import pytest

ADMIN_EMAIL = os.environ["BOOTSTRAP_ADMIN_EMAIL"]
ADMIN_PASSWORD = os.environ["BOOTSTRAP_ADMIN_PASSWORD"]


@pytest.fixture
def client():
    """TestClient con esquema `auth` recreado por test (aislamiento total).

    Requiere un Postgres accesible (lo provee el job de CI, igual que
    `test-document-service`). El lifespan de la app crea las tablas y siembra
    roles + admin.
    """
    from sqlalchemy import text

    from app.database import engine

    with engine.connect() as conn:
        conn.execute(text("DROP SCHEMA IF EXISTS auth CASCADE"))
        conn.execute(text("CREATE SCHEMA auth"))
        conn.commit()

    from fastapi.testclient import TestClient

    from app.main import app
    from app.routers import auth as auth_router

    auth_router.LOGIN_ATTEMPTS.clear()

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def admin_token(client):
    response = client.post(
        "/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
