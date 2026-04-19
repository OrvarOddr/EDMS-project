from jose import jwt, JWTError
from app.config import settings


PUBLIC_ROUTES = {
    ("POST", "/auth/login"),
    ("POST", "/auth/refresh"),
    ("GET",  "/health"),
}


def is_public(method: str, path: str) -> bool:
    return (method.upper(), path) in PUBLIC_ROUTES


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return {}
