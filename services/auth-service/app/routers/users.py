from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Role, UserRole
from app.schemas import CreateUserRequest, UserResponse
from app.security import hash_password, decode_token
from app.routers.auth import _get_active_roles
from jose import JWTError
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

router = APIRouter(prefix="/users", tags=["users"])
bearer = HTTPBearer()


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
    return UserResponse(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        status=user.status,
        is_superuser=user.is_superuser,
        roles=roles,
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
    )
    db.add(user)
    db.flush()

    assignment = UserRole(
        user_id=user.id,
        role_id=role.id,
        assigned_by_user_id=actor.id,
    )
    db.add(assignment)
    db.commit()
    db.refresh(user)

    return _to_user_response(db, user)


@router.get("", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db), actor: User = Depends(_current_user)):
    if not actor.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo superusuarios pueden listar usuarios")

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
