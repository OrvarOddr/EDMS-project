import httpx
from fastapi import APIRouter, Request, Response, HTTPException, status
from app.config import settings
from app.security import is_public, decode_token

router = APIRouter()

SERVICE_MAP = {
    "/auth":          settings.AUTH_SERVICE_URL,
    "/users":         settings.AUTH_SERVICE_URL,
    "/roles":         settings.AUTH_SERVICE_URL,
    "/documents":     settings.DOCUMENT_SERVICE_URL,
    "/tags":          settings.DOCUMENT_SERVICE_URL,
    "/files":         settings.FILE_SERVICE_URL,
    "/workflow":      settings.WORKFLOW_SERVICE_URL,
    "/collaboration": settings.COLLABORATION_SERVICE_URL,
}

TIMEOUT = httpx.Timeout(30.0)


def _resolve_service(path: str) -> str | None:
    for prefix, url in SERVICE_MAP.items():
        if path == prefix or path.startswith(prefix + "/"):
            return url
    return None


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy(path: str, request: Request):
    full_path = f"/{path}"
    payload = None

    # JWT validation for protected routes
    if not is_public(request.method, full_path):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token requerido")
        token = auth_header.removeprefix("Bearer ")
        payload = decode_token(token)
        if not payload:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    target = _resolve_service(full_path)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ruta no encontrada")

    url = f"{target}{full_path}"
    body = await request.body()

    # Forward headers, remove hop-by-hop
    headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in {
            "host",
            "content-length",
            "transfer-encoding",
            "connection",
            "x-user-id",
            "x-user-email",
            "x-user-status",
            "x-user-roles",
        }
    }
    if payload:
        roles = payload.get("roles") or []
        headers["X-User-Id"] = str(payload.get("sub", ""))
        headers["X-User-Email"] = str(payload.get("email", ""))
        headers["X-User-Status"] = str(payload.get("status", ""))
        headers["X-User-Roles"] = ",".join(str(role) for role in roles)

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.request(
            method=request.method,
            url=url,
            content=body,
            headers=headers,
            params=request.query_params,
        )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=dict(resp.headers),
        media_type=resp.headers.get("content-type"),
    )
