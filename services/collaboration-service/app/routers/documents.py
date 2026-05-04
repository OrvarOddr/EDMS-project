import httpx
from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.config import settings

router = APIRouter(prefix="/collaboration/documents", tags=["collaboration-documents"])


class TimelineItemResponse(BaseModel):
    id: str
    actor_user_id: str | None = None
    action: str
    body: str | None = None
    created_at: str


class DocumentTimelineResponse(BaseModel):
    comments: list[TimelineItemResponse] = Field(default_factory=list)
    history: list[TimelineItemResponse] = Field(default_factory=list)


def _assert_document_access(document_id: str, user_id: str) -> None:
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.get(
                f"{settings.DOCUMENT_SERVICE_URL}/internal/documents/{document_id}/access",
                headers={"X-User-Id": user_id},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo validar acceso al documento",
        ) from exc

    if response.status_code in {
        status.HTTP_401_UNAUTHORIZED,
        status.HTTP_403_FORBIDDEN,
        status.HTTP_404_NOT_FOUND,
    }:
        raise HTTPException(status_code=response.status_code, detail="No puedes ver este documento")
    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="document-service rechazo la validacion de acceso",
        )


@router.get("/{document_id}/timeline", response_model=DocumentTimelineResponse)
def get_document_timeline(
    document_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")
    document_id = document_id.strip()
    if not document_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Documento requerido")
    _assert_document_access(document_id, x_user_id)

    # US-011 solo necesita consolidar la lectura del detalle. Comentarios reales
    # se implementaran cuando llegue la historia de colaboracion.
    return DocumentTimelineResponse()
