from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, RefreshToken
from app.schemas import LoginRequest, TokenResponse, RefreshRequest
from app.security import verify_password, create_access_token, create_refresh_token, decode_token, hash_token
from jose import JWTError

router = APIRouter(prefix="/auth", tags=["auth"])


def _get_active_roles(db: Session, user_id: str) -> list[str]:
    from app.models import UserRole, Role
    rows = (
        db.query(Role.code)
        .join(UserRole, UserRole.role_id == Role.id)
        .filter(UserRole.user_id == user_id, UserRole.is_active.is_(True))
        .all()
    )
    return [r.code for r in rows]


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email, User.deleted_at.is_(None)).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")
    if user.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cuenta inactiva")

    roles = _get_active_roles(db, user.id)
    access_token = create_access_token(user.id, roles)
    refresh_token = create_refresh_token(user.id)

    payload = decode_token(refresh_token)
    expires_at = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)

    db_token = RefreshToken(
        user_id=user.id,
        token_hash=hash_token(refresh_token),
        expires_at=expires_at,
        created_by_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.add(db_token)
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    try:
        payload = decode_token(body.refresh_token)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    token_hash = hash_token(body.refresh_token)
    db_token = db.query(RefreshToken).filter(
        RefreshToken.token_hash == token_hash,
        RefreshToken.is_active.is_(True),
        RefreshToken.revoked_at.is_(None),
    ).first()

    if not db_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revocado o inexistente")

    now = datetime.now(timezone.utc)
    if db_token.expires_at < now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expirado")

    db_token.revoked_at = now
    db_token.is_active = False

    user_id = payload["sub"]
    user = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
    if not user or user.status != "active":
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no disponible")

    roles = _get_active_roles(db, user_id)
    new_access = create_access_token(user_id, roles)
    new_refresh = create_refresh_token(user_id)

    new_payload = decode_token(new_refresh)
    new_expires = datetime.fromtimestamp(new_payload["exp"], tz=timezone.utc)

    new_db_token = RefreshToken(
        user_id=user_id,
        token_hash=hash_token(new_refresh),
        expires_at=new_expires,
        created_by_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    db.add(new_db_token)
    db.commit()

    return TokenResponse(access_token=new_access, refresh_token=new_refresh)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(body: RefreshRequest, db: Session = Depends(get_db)):
    token_hash = hash_token(body.refresh_token)
    db_token = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if db_token and db_token.is_active:
        db_token.revoked_at = datetime.now(timezone.utc)
        db_token.is_active = False
        db.commit()
