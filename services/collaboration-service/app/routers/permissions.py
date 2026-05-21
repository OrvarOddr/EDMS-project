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


class PermissionGrantResponse(BaseModel):
    id: str
    document_id: str
    grantee_user_id: str
    permission_code: str
    granted_by_user_id: str
    granted_at: str


class PermissionGrantListResponse(BaseModel):
    grants: list[PermissionGrantResponse] = Field(default_factory=list)


def _require(value: str, field: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field} requerido")
    return cleaned


def _assert_can_manage(document_id: str, user_id: str) -> None:
    """El otorgante debe poder administrar permisos sobre el documento.

    Se delega en document-service /internal/documents/{id}/access con
    permission=manage_permissions. El owner ya pasa porque tiene todos los
    permisos.
    """
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.get(
                f"{settings.DOCUMENT_SERVICE_URL}/internal/documents/{document_id}/access",
                headers={"X-User-Id": user_id},
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


def _to_response(grant: DocumentPermissionGrant) -> PermissionGrantResponse:
    return PermissionGrantResponse(
        id=grant.id,
        document_id=grant.document_id,
        grantee_user_id=grant.grantee_user_id,
        permission_code=grant.permission_code,
        granted_by_user_id=grant.granted_by_user_id,
        granted_at=grant.granted_at.isoformat(),
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

    _assert_can_manage(document_id, x_user_id)

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
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    document_id = _require(document_id, "Documento")
    grant_id = _require(grant_id, "Grant")
    _assert_can_manage(document_id, x_user_id)

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
    rows = (
        db.query(DocumentPermissionGrant.permission_code)
        .filter(
            DocumentPermissionGrant.document_id == document_id,
            DocumentPermissionGrant.grantee_user_id == user_id,
            DocumentPermissionGrant.is_active.is_(True),
        )
        .all()
    )
    return {"permissions": sorted({code for (code,) in rows})}
