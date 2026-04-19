from contextlib import asynccontextmanager
from sqlalchemy import text
from fastapi import FastAPI
from app.database import engine, Base, SessionLocal
from app.routers import health
from app.routers import auth, users, roles


def _seed(db):
    from app.models import Role, User
    from app.security import hash_password
    import os

    default_roles = [
        ("admin", "Administrador", "Acceso total al sistema"),
        ("coordinador", "Coordinador", "Gestión de flujos y documentos"),
        ("revisor", "Revisor", "Revisión y aprobación de documentos"),
        ("colaborador", "Colaborador", "Edición de documentos asignados"),
        ("solo_lectura", "Solo Lectura", "Visualización sin edición"),
    ]
    for code, name, desc in default_roles:
        if not db.query(Role).filter(Role.code == code).first():
            db.add(Role(code=code, name=name, description=desc))

    admin_email = os.getenv("BOOTSTRAP_ADMIN_EMAIL", "admin@edms.dev")
    admin_password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "changeme123")
    if not db.query(User).filter(User.email == admin_email).first():
        db.add(User(
            email=admin_email,
            password_hash=hash_password(admin_password),
            first_name="Admin",
            last_name="Sistema",
            is_superuser=True,
        ))

    db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS auth"))
        conn.commit()
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        _seed(db)
    finally:
        db.close()
    yield


app = FastAPI(title="auth-service", lifespan=lifespan)
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(roles.router)
