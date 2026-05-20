from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.database import engine, Base, SessionLocal
from app.routers import health
from app.routers import auth, users, roles

WEAK_BOOTSTRAP_PASSWORDS = {
    "admin",
    "admin123",
    "cambia_esto",
    "changeme123",
    "generar_un_valor_fuerte",
    "generar_un_valor_fuerte_de_minimo_12_caracteres",
    "password",
}


def _seed(db):
    from app.models import Role, User, UserRole
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

    admin_email = os.getenv("BOOTSTRAP_ADMIN_EMAIL", "admin@edms.dev").strip().lower()
    admin_user = db.query(User).filter(User.email == admin_email).first()
    if not admin_user:
        admin_password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD")
        if (
            not admin_password
            or len(admin_password) < 12
            or admin_password.strip().lower() in WEAK_BOOTSTRAP_PASSWORDS
        ):
            raise RuntimeError(
                "BOOTSTRAP_ADMIN_PASSWORD es obligatorio, debe tener al menos 12 caracteres "
                "y no puede ser un valor por defecto."
            )
        admin_user = User(
            email=admin_email,
            password_hash=hash_password(admin_password),
            first_name="Admin",
            last_name="Sistema",
            is_superuser=True,
        )
        db.add(admin_user)
        db.flush()

    admin_role = db.query(Role).filter(Role.code == "admin").first()
    has_admin_role = db.query(UserRole).filter(
        UserRole.user_id == admin_user.id,
        UserRole.role_id == admin_role.id if admin_role else None,
        UserRole.is_active.is_(True),
    ).first()
    if admin_role and not has_admin_role:
        db.add(UserRole(user_id=admin_user.id, role_id=admin_role.id))

    db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    # Migracion en sitio: agregar columna color a auth.users si no existe.
    with engine.begin() as conn:
        from sqlalchemy import text
        conn.execute(text("ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS color VARCHAR"))
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
