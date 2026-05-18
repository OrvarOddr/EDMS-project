"""US-028: actividad reciente del usuario.

Fuente: la tabla `notifications`, que ya agrega eventos cross-service
(cambios de estado, comentarios, menciones, asignaciones) y esta acotada
por destinatario, por lo que respeta los permisos del usuario.
"""
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Notification

router = APIRouter(prefix="/collaboration/activity", tags=["collaboration-activity"])


class ActivityItem(BaseModel):
    id: str
    actor_user_id: str | None = None
    document_id: str | None = None
    type: str
    title: str
    body: str | None = None
    created_at: str


class ActivityListResponse(BaseModel):
    items: list[ActivityItem] = Field(default_factory=list)


@router.get("", response_model=ActivityListResponse)
def list_recent_activity(
    limit: int = Query(default=15, ge=1, le=50),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    rows = (
        db.query(Notification)
        .filter(Notification.recipient_user_id == x_user_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )
    return ActivityListResponse(
        items=[
            ActivityItem(
                id=row.id,
                actor_user_id=row.actor_user_id,
                document_id=row.document_id,
                type=row.type,
                title=row.title,
                body=row.body,
                created_at=row.created_at.isoformat(),
            )
            for row in rows
        ]
    )
