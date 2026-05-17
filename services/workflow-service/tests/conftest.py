"""Bootstrap de entorno y fixtures para tests de workflow-service.

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


@pytest.fixture
def client():
    """TestClient con el esquema `workflow` recreado por test.

    Requiere Postgres (lo provee el job de CI). El lifespan crea las tablas
    y aplica el ALTER de la columna `comment`.
    """
    from sqlalchemy import text

    from app.database import engine

    with engine.connect() as conn:
        conn.execute(text("DROP SCHEMA IF EXISTS workflow CASCADE"))
        conn.execute(text("CREATE SCHEMA workflow"))
        conn.commit()

    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db_session():
    """Sesion directa para preparar/inspeccionar datos en los tests."""
    from app.database import SessionLocal

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
