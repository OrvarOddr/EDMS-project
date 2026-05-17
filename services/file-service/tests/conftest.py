"""Bootstrap de entorno y fixtures para tests de file-service.

Fija variables dummy ANTES de que pytest importe `app.*`, porque
`app.config.Settings()` se evalua al importar y exige estas variables.
`setdefault` no pisa valores reales que CI inyecte.
"""
import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:postgres@localhost:5432/test_db",
)
os.environ.setdefault("MINIO_ACCESS_KEY", "test-access-key")
os.environ.setdefault("MINIO_SECRET_KEY", "test-secret-key")

import pytest


@pytest.fixture
def client():
    """TestClient con el esquema `files` recreado por test.

    El lifespan solo crea tablas (no toca MinIO), por eso sirve para probar
    autenticacion y validaciones que ocurren antes del almacenamiento.
    """
    from sqlalchemy import text

    from app.database import engine

    with engine.connect() as conn:
        conn.execute(text("DROP SCHEMA IF EXISTS files CASCADE"))
        conn.execute(text("CREATE SCHEMA files"))
        conn.commit()

    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
