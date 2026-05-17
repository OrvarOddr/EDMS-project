"""Bootstrap de entorno para tests.

Fija variables dummy ANTES de que pytest importe `app.*`, porque
`app.config.Settings()` se evalua al importar y exige estas variables.
`setdefault` no pisa valores reales que CI inyecte. api-gateway no usa BD.
"""
import os

os.environ.setdefault(
    "JWT_SECRET_KEY",
    "test-jwt-secret-key-with-at-least-32-characters",
)
