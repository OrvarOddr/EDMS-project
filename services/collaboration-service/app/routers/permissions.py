"""US-005: otorgar permisos explicitos por documento.

Endpoints publicos (via api-gateway):
- POST   /collaboration/documents/{document_id}/permissions
- DELETE /collaboration/documents/{document_id}/permissions/{grant_id}
- GET    /collaboration/documents/{document_id}/permissions

Endpoint interno (consumido por document-service para resolver permisos):
- GET    /internal/collaboration/documents/{document_id}/permissions
"""
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import DocumentPermissionGrant, Notification

router = APIRouter(prefix="/collaboration/documents", tags=["collaboration-permissions"])
internal_router = APIRouter(
    prefix="/internal/collaboration/documents",
    tags=["collaboration-permissions"],
)

# Permisos otorgables segun US-005. Tienen que coincidir con los codigos que
# entiende document-service en _has_document_permission.
VALID_PERMISSIONS: frozenset[str] = frozenset({
    "view",
    "comment",
    "download",
    "edit_metadata",
    "upload_version",
    "move_state",
    "approve",
    "manage_permissions",
    "share",
})


class GrantPermissionRequest(BaseModel):
    grantee_user_id: str
    permission_code: str
    expires_at: datetime | None = None


class PermissionGrantResponse(BaseModel):
    id: str
    document_id: str
    grantee_user_id: str
    permission_code: str
    granted_by_user_id: str
    granted_at: str
    expires_at: str | None = None
    is_expired: bool = False


class PermissionGrantListResponse(BaseModel):
    grants: list[PermissionGrantResponse] = Field(default_factory=list)


def _require(value: str, field: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field} requerido")
    return cleaned


def _assert_can_manage(document_id: str, user_id: str, x_user_roles: str | None = None) -> None:
    """El otorgante debe poder administrar permisos sobre el documento.

    Se delega en document-service /internal/documents/{id}/access con
    permission=manage_permissions. El owner ya pasa porque tiene todos los
    permisos; un admin tambien, gracias al bypass por X-User-Roles.
    """
    headers = {"X-User-Id": user_id}
    if x_user_roles:
        headers["X-User-Roles"] = x_user_roles
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.get(
                f"{settings.DOCUMENT_SERVICE_URL}/internal/documents/{document_id}/access",
                headers=headers,
                params={"permission": "manage_permissions"},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo validar permiso para administrar accesos",
        ) from exc
    if response.status_code in {
        status.HTTP_401_UNAUTHORIZED,
        status.HTTP_403_FORBIDDEN,
        status.HTTP_404_NOT_FOUND,
    }:
        raise HTTPException(status_code=response.status_code, detail="No puedes administrar permisos de este documento")
    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="document-service rechazo la validacion de permiso",
        )


def _notify_grant(
    db: Session,
    document_id: str,
    recipient_user_id: str,
    actor_user_id: str,
    grant_id: str,
    permission_code: str,
) -> None:
    """Inserta la notificacion directo en la tabla. Estamos dentro del mismo
    servicio que sirve /internal/collaboration/notifications, evitamos el
    salto HTTP.
    """
    db.add(
        Notification(
            recipient_user_id=recipient_user_id,
            actor_user_id=actor_user_id,
            document_id=document_id,
            source_id=grant_id,
            type="permiso_otorgado",
            title=f"Te otorgaron permiso de {permission_code}",
            body=f"Tienes permiso de {permission_code} sobre el documento {document_id}.",
        )
    )


def _is_expired(grant: DocumentPermissionGrant, now: datetime | None = None) -> bool:
    if grant.expires_at is None:
        return False
    reference = now or datetime.now(timezone.utc)
    return grant.expires_at <= reference


def _to_response(grant: DocumentPermissionGrant) -> PermissionGrantResponse:
    return PermissionGrantResponse(
        id=grant.id,
        document_id=grant.document_id,
        grantee_user_id=grant.grantee_user_id,
        permission_code=grant.permission_code,
        granted_by_user_id=grant.granted_by_user_id,
        granted_at=grant.granted_at.isoformat(),
        expires_at=grant.expires_at.isoformat() if grant.expires_at else None,
        is_expired=_is_expired(grant),
    )


def _notify_revoke(
    db: Session,
    document_id: str,
    recipient_user_id: str,
    actor_user_id: str,
    grant_id: str,
    permission_code: str,
) -> None:
    """US-006: notifica al grantee cuando le revocan un permiso."""
    db.add(
        Notification(
            recipient_user_id=recipient_user_id,
            actor_user_id=actor_user_id,
            document_id=document_id,
            source_id=grant_id,
            type="permiso_revocado",
            title=f"Revocaron tu permiso de {permission_code}",
            body=f"Perdiste el permiso de {permission_code} sobre el documento {document_id}.",
        )
    )


@router.post(
    "/{document_id}/permissions",
    response_model=PermissionGrantResponse,
    status_code=status.HTTP_201_CREATED,
)
def grant_permission(
    document_id: str,
    body: GrantPermissionRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    document_id = _require(document_id, "Documento")
    grantee = _require(body.grantee_user_id, "Usuario destinatario")
    permission = _require(body.permission_code, "Permiso")

    if permission not in VALID_PERMISSIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Permiso invalido: {permission}",
        )

    expires_at = body.expires_at
    if expires_at is not None:
        # Normalizar a UTC (Pydantic puede pasar naive si el cliente envia sin tz).
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="expires_at debe ser una fecha futura",
            )

    _assert_can_manage(document_id, x_user_id, x_user_roles=x_user_roles)

    duplicate = (
        db.query(DocumentPermissionGrant)
        .filter(
            DocumentPermissionGrant.document_id == document_id,
            DocumentPermissionGrant.grantee_user_id == grantee,
            DocumentPermissionGrant.permission_code == permission,
            DocumentPermissionGrant.is_active.is_(True),
        )
        .first()
    )
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El usuario ya tiene ese permiso activo en el documento",
        )

    grant = DocumentPermissionGrant(
        document_id=document_id,
        grantee_user_id=grantee,
        permission_code=permission,
        granted_by_user_id=x_user_id,
        expires_at=expires_at,
    )
    db.add(grant)
    db.flush()

    if grantee != x_user_id:
        _notify_grant(db, document_id, grantee, x_user_id, grant.id, permission)

    db.commit()
    db.refresh(grant)
    return _to_response(grant)


@router.delete(
    "/{document_id}/permissions/{grant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def revoke_permission(
    document_id: str,
    grant_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    document_id = _require(document_id, "Documento")
    grant_id = _require(grant_id, "Grant")
    _assert_can_manage(document_id, x_user_id, x_user_roles=x_user_roles)

    grant = (
        db.query(DocumentPermissionGrant)
        .filter(
            DocumentPermissionGrant.id == grant_id,
            DocumentPermissionGrant.document_id == document_id,
            DocumentPermissionGrant.is_active.is_(True),
        )
        .first()
    )
    if not grant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Permiso no encontrado")

    grant.is_active = False
    grant.revoked_at = datetime.now(timezone.utc)
    # US-006: notificar al afectado (solo si no es el propio actor que se
    # revoca a si mismo, caso poco habitual pero posible).
    if grant.grantee_user_id != x_user_id:
        _notify_revoke(db, document_id, grant.grantee_user_id, x_user_id, grant.id, grant.permission_code)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/{document_id}/permissions",
    response_model=PermissionGrantListResponse,
)
def list_permissions(
    document_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    document_id = _require(document_id, "Documento")
    grants = (
        db.query(DocumentPermissionGrant)
        .filter(
            DocumentPermissionGrant.document_id == document_id,
            DocumentPermissionGrant.is_active.is_(True),
        )
        .order_by(DocumentPermissionGrant.granted_at.desc())
        .all()
    )
    return PermissionGrantListResponse(grants=[_to_response(grant) for grant in grants])


@internal_router.get("/{document_id}/permissions")
def list_permissions_for_user(
    document_id: str,
    user_id: str = Query(...),
    db: Session = Depends(get_db),
):
    """Endpoint interno consumido por document-service para resolver permisos.

    Devuelve los codigos de permiso activos otorgados al usuario sobre el
    documento. No exige X-User-Id porque se llama desde otro servicio en la
    red privada.
    """
    document_id = _require(document_id, "Documento")
    user_id = _require(user_id, "Usuario")
    now = datetime.now(timezone.utc)
    rows = (
        db.query(DocumentPermissionGrant.permission_code)
        .filter(
            DocumentPermissionGrant.document_id == document_id,
            DocumentPermissionGrant.grantee_user_id == user_id,
            DocumentPermissionGrant.is_active.is_(True),
            # US-007: excluimos grants expirados; siguen en DB pero no autorizan.
            (DocumentPermissionGrant.expires_at.is_(None)) | (DocumentPermissionGrant.expires_at > now),
        )
        .all()
    )
    return {"permissions": sorted({code for (code,) in rows})}


@internal_router.get("/{document_id}/permissions/history")
def list_permission_history(
    document_id: str,
    db: Session = Depends(get_db),
):
    """US-025: eventos de otorgamiento y revocacion para el historial del documento.

    Consumido por document-service al armar el detalle. Devuelve dos tipos de
    evento por cada grant cuando aplica: 'permission_granted' (granted_at) y
    'permission_revoked' (revoked_at).
    """
    document_id = _require(document_id, "Documento")
    grants = (
        db.query(DocumentPermissionGrant)
        .filter(DocumentPermissionGrant.document_id == document_id)
        .all()
    )
    events: list[dict] = []
    for grant in grants:
        events.append({
            "id": grant.id,
            "actor_user_id": grant.granted_by_user_id,
            "action": "permission_granted",
            "body": grant.grantee_user_id,
            "note": grant.permission_code,
            "created_at": grant.granted_at.isoformat(),
        })
        if grant.revoked_at is not None:
            events.append({
                "id": f"{grant.id}-revoked",
                "actor_user_id": grant.granted_by_user_id,
                "action": "permission_revoked",
                "body": grant.grantee_user_id,
                "note": grant.permission_code,
                "created_at": grant.revoked_at.isoformat(),
            })
        # US-007: si expiro sin revocacion manual, agregar evento sintetico.
        if grant.expires_at is not None and grant.expires_at <= datetime.now(timezone.utc):
            events.append({
                "id": f"{grant.id}-expired",
                "actor_user_id": grant.granted_by_user_id,
                "action": "permission_expired",
                "body": grant.grantee_user_id,
                "note": grant.permission_code,
                "created_at": grant.expires_at.isoformat(),
            })
    return {"events": events}
