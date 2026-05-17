"""Bootstrap de entorno y fixtures para tests de api-gateway.

Fija variables dummy ANTES de que pytest importe `app.*`, porque
`app.config.Settings()` se evalua al importar y exige estas variables.
api-gateway no usa base de datos.
"""
import os

os.environ.setdefault(
    "JWT_SECRET_KEY",
    "test-jwt-secret-key-with-at-least-32-characters",
)

import pytest


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


@pytest.fixture
def access_token():
    """Token de acceso valido firmado con la config de test."""
    from datetime import datetime, timedelta, timezone

    from jose import jwt

    from app.config import settings

    now = datetime.now(timezone.utc)
    payload = {
        "sub": "user-1",
        "exp": now + timedelta(minutes=10),
        "iat": now,
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
        "type": "access",
        "email": "user@edms.dev",
        "status": "active",
        "roles": ["admin"],
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
