"""Bootstrap de entorno para tests.

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
