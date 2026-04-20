from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
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


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    body: CreateUserRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(_current_user),
):
    if not actor.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo superusuarios pueden crear usuarios")

    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email ya registrado")

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        first_name=body.first_name,
        last_name=body.last_name,
        is_superuser=body.is_superuser,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

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


@router.get("/me", response_model=UserResponse)
def get_me(db: Session = Depends(get_db), actor: User = Depends(_current_user)):
    roles = _get_active_roles(db, actor.id)
    return UserResponse(
        id=actor.id,
        email=actor.email,
        first_name=actor.first_name,
        last_name=actor.last_name,
        status=actor.status,
        is_superuser=actor.is_superuser,
        roles=roles,
    )
