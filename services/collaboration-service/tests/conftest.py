"""Bootstrap de entorno y fixtures para tests de collaboration-service.

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

DOCUMENT_SERVICE_URL = "http://document-service:8002"
WORKFLOW_SERVICE_URL = "http://workflow-service:8003"


@pytest.fixture
def client():
    """TestClient con el esquema `collaboration` recreado por test.

    Requiere Postgres (lo provee el job de CI). El lifespan crea las tablas
    y aplica los ALTER de columnas.
    """
    from sqlalchemy import text

    from app.database import engine

    with engine.connect() as conn:
        conn.execute(text("DROP SCHEMA IF EXISTS collaboration CASCADE"))
        conn.execute(text("CREATE SCHEMA collaboration"))
        conn.commit()

    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db_session():
    from app.database import SessionLocal

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
