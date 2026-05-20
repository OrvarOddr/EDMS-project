import random

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import AuditEvent, User, Role, UserRole
from app.schemas import CreateUserRequest, UserResponse
from app.security import hash_password, decode_token
from app.routers.auth import _get_active_roles
from jose import JWTError
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

router = APIRouter(prefix="/users", tags=["users"])
bearer = HTTPBearer()

# Paleta de colores de avatar (oklch). Misma familia que usa el frontend, asi
# los circulos quedan consistentes en todo el sistema. El color se asigna al
# crear el usuario y se persiste; los usuarios pre-existentes lo obtienen
# perezosamente la primera vez que _to_user_response los sirve.
AVATAR_PALETTE: tuple[str, ...] = (
    "oklch(0.74 0.16 25)",   # salmon
    "oklch(0.78 0.15 55)",   # naranja
    "oklch(0.76 0.15 150)",  # verde
    "oklch(0.73 0.13 245)",  # azul
    "oklch(0.72 0.17 295)",  # violeta
    "oklch(0.73 0.18 330)",  # rosa
    "oklch(0.75 0.14 200)",  # turquesa
    "oklch(0.78 0.15 90)",   # amarillo
    "oklch(0.70 0.15 180)",  # cian profundo
    "oklch(0.68 0.16 265)",  # indigo
    "oklch(0.80 0.14 70)",   # ambar
    "oklch(0.72 0.19 350)",  # magenta
)


def _generate_avatar_color(seed: str | None = None) -> str:
    """Color de avatar. Si se pasa seed se elige deterministicamente (util para
    backfill estable); sin seed elige aleatorio (al crear usuario).
    """
    if seed:
        # Hash simple para que el color sea estable para el mismo id/email.
        h = 0
        for ch in seed:
            h = (h * 31 + ord(ch)) & 0xFFFFFFFF
        return AVATAR_PALETTE[h % len(AVATAR_PALETTE)]
    return random.choice(AVATAR_PALETTE)


def _pick_avatar_color_least_used(db: Session) -> str:
    """Elige un color de la paleta que aparezca menos veces entre los usuarios
    activos no eliminados. Con tie-break aleatorio, asi varios usuarios creados
    seguidos quedan en colores distintos en vez de chocar en el mismo tono.
    """
    counts = {color: 0 for color in AVATAR_PALETTE}
    used = (
        db.query(User.color)
        .filter(User.deleted_at.is_(None), User.color.isnot(None))
        .all()
    )
    for (color,) in used:
        if color in counts:
            counts[color] += 1
    min_count = min(counts.values())
    candidates = [color for color, c in counts.items() if c == min_count]
    return random.choice(candidates)


def _current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = decode_token(credentials.credentials, expected_type="access")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    user = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")
    if user.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no disponible")
    return user


def _to_user_response(db: Session, user: User) -> UserResponse:
    roles = _get_active_roles(db, user.id)
    if not user.color:
        # Backfill perezoso: usuarios pre-existentes (o creados antes de esta
        # feature) reciben un color deterministico desde su id la primera vez
        # que se sirven. Asi todas las llamadas devuelven el mismo valor.
        user.color = _generate_avatar_color(seed=user.id)
        db.commit()
    return UserResponse(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        status=user.status,
        is_superuser=user.is_superuser,
        roles=roles,
        color=user.color,
    )


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    body: CreateUserRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(_current_user),
):
    if not actor.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo superusuarios pueden crear usuarios")

    normalized_email = body.email.strip().lower()
    existing = db.query(User).filter(User.email == normalized_email, User.deleted_at.is_(None)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email ya registrado")

    role = db.query(Role).filter(Role.id == body.role_id).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rol no encontrado")

    user = User(
        email=normalized_email,
        password_hash=hash_password(body.password),
        first_name=body.first_name,
        last_name=body.last_name,
        status=body.status,
        is_superuser=role.code == "admin",
        color=_pick_avatar_color_least_used(db),
    )
    db.add(user)
    db.flush()

    assignment = UserRole(
        user_id=user.id,
        role_id=role.id,
        assigned_by_user_id=actor.id,
    )
    db.add(assignment)
    db.add(AuditEvent(
        actor_user_id=actor.id,
        target_user_id=user.id,
        action="global_role_assigned",
        resource_type="user",
        resource_id=user.id,
        details={
            "source": "user_creation",
            "previous_roles": [],
            "new_role": role.code,
            "new_role_id": role.id,
        },
    ))
    db.commit()
    db.refresh(user)

    return _to_user_response(db, user)


@router.get("", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db), actor: User = Depends(_current_user)):
    # Lectura del directorio: cualquier usuario autenticado puede listar a sus
    # colegas para resolver encargados/menciones/asignaciones en el frontend.
    # La creacion/edicion sigue siendo solo de superusers.
    _ = actor
    users = (
        db.query(User)
        .filter(User.deleted_at.is_(None))
        .order_by(User.first_name.asc(), User.last_name.asc(), User.email.asc())
        .all()
    )
    return [_to_user_response(db, user) for user in users]


@router.get("/me", response_model=UserResponse)
def get_me(db: Session = Depends(get_db), actor: User = Depends(_current_user)):
    return _to_user_response(db, actor)
