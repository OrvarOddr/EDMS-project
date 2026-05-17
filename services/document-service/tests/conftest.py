"""Bootstrap de entorno y fixtures para tests de document-service.

Fija variables dummy ANTES de que pytest importe `app.*`, porque
`app.config.Settings()` se evalua al importar y exige estas variables.
`setdefault` no pisa valores reales que CI inyecte.
"""
import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:postgres@localhost:5432/test_db",
)

import pytest

WORKFLOW_SERVICE_URL = "http://workflow-service:8003"
COLLABORATION_SERVICE_URL = "http://collaboration-service:8004"
FILE_SERVICE_URL = "http://file-service:8005"


@pytest.fixture
def client():
    """TestClient con el esquema `documents` recreado por test.

    Requiere Postgres (lo provee el job de CI). El lifespan crea tablas,
    aplica ALTER/INDEX y hace backfill (sin filas => sin red).
    """
    from sqlalchemy import text

    from app.database import engine

    with engine.connect() as conn:
        conn.execute(text("DROP SCHEMA IF EXISTS documents CASCADE"))
        conn.execute(text("CREATE SCHEMA documents"))
        conn.commit()

    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
