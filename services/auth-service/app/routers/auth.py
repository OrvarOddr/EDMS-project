from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, RefreshToken
from app.schemas import LoginRequest, TokenResponse, RefreshRequest
from app.security import verify_password, create_access_token, create_refresh_token, decode_token, hash_token
from jose import JWTError

router = APIRouter(prefix="/auth", tags=["auth"])

LOGIN_WINDOW = timedelta(minutes=15)
LOGIN_MAX_ATTEMPTS = 5
LOGIN_ATTEMPTS: dict[str, list[datetime]] = {}


def _get_active_roles(db: Session, user_id: str) -> list[str]:
    from app.models import UserRole, Role
    rows = (
        db.query(Role.code)
        .join(UserRole, UserRole.role_id == Role.id)
        .filter(UserRole.user_id == user_id, UserRole.is_active.is_(True))
        .all()
    )
    return [r.code for r in rows]


def _login_key(email: str, request: Request) -> str:
    ip = request.client.host if request.client else "unknown"
    return f"{ip}:{email}"


def _prune_attempts(key: str, now: datetime) -> list[datetime]:
    attempts = [item for item in LOGIN_ATTEMPTS.get(key, []) if now - item < LOGIN_WINDOW]
    LOGIN_ATTEMPTS[key] = attempts
    return attempts


def _ensure_login_not_limited(key: str) -> None:
    attempts = _prune_attempts(key, datetime.now(timezone.utc))
    if len(attempts) >= LOGIN_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos de inicio de sesion. Intenta mas tarde.",
        )


def _record_failed_login(key: str) -> None:
    now = datetime.now(timezone.utc)
    attempts = _prune_attempts(key, now)
    attempts.append(now)
    LOGIN_ATTEMPTS[key] = attempts


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    normalized_email = body.email.strip().lower()
    login_key = _login_key(normalized_email, request)
    _ensure_login_not_limited(login_key)
    user = db.query(User).filter(User.email == normalized_email, User.deleted_at.is_(None)).first()
    if not user or not verify_password(body.password, user.password_hash):
        _record_failed_login(login_key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")
    if user.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cuenta inactiva")

    LOGIN_ATTEMPTS.pop(login_key, None)
    roles = _get_active_roles(db, user.id)
    access_token = create_access_token(user.id, roles, email=user.email, status=user.status)
    refresh_token = create_refresh_token(user.id)

    payload = decode_token(refresh_token, expected_type="refresh")
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
        payload = decode_token(body.refresh_token, expected_type="refresh")
    except JWTError:
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
    new_access = create_access_token(user_id, roles, email=user.email, status=user.status)
    new_refresh = create_refresh_token(user_id)

    new_payload = decode_token(new_refresh, expected_type="refresh")
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
