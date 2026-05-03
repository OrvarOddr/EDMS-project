from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field

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


@router.get("/{document_id}/timeline", response_model=DocumentTimelineResponse)
def get_document_timeline(
    document_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")
    if not document_id.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Documento requerido")

    # US-011 solo necesita consolidar la lectura del detalle. Comentarios reales
    # se implementaran cuando llegue la historia de colaboracion.
    return DocumentTimelineResponse()
