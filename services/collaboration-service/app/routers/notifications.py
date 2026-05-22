from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Notification

router = APIRouter(prefix="/collaboration/notifications", tags=["collaboration-notifications"])
internal_router = APIRouter(prefix="/internal/collaboration/notifications", tags=["collaboration-internal"])


class CreateNotificationRequest(BaseModel):
    recipient_user_id: str
    type: str
    title: str
    actor_user_id: str | None = None
    document_id: str | None = None
    document_name: str | None = None
    source_id: str | None = None
    body: str | None = None


class NotificationResponse(BaseModel):
    id: str
    recipient_user_id: str
    actor_user_id: str | None = None
    document_id: str | None = None
    document_name: str | None = None
    source_id: str | None = None
    type: str
    title: str
    body: str | None = None
    is_read: bool
    created_at: str
    read_at: str | None = None


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse] = Field(default_factory=list)
    unread_count: int = 0


def _serialize(notification: Notification) -> NotificationResponse:
    return NotificationResponse(
        id=notification.id,
        recipient_user_id=notification.recipient_user_id,
        actor_user_id=notification.actor_user_id,
        document_id=notification.document_id,
        document_name=notification.document_name,
        source_id=notification.source_id,
        type=notification.type,
        title=notification.title,
        body=notification.body,
        is_read=notification.is_read,
        created_at=notification.created_at.isoformat(),
        read_at=notification.read_at.isoformat() if notification.read_at else None,
    )


@internal_router.post("", response_model=NotificationResponse, status_code=status.HTTP_201_CREATED)
def create_notification(body: CreateNotificationRequest, db: Session = Depends(get_db)):
    recipient = body.recipient_user_id.strip()
    title = body.title.strip()
    notif_type = body.type.strip()
    if not recipient or not title or not notif_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="recipient_user_id, type y title son requeridos",
        )

    source_id = body.source_id.strip() if body.source_id and body.source_id.strip() else None
    if source_id:
        duplicate = (
            db.query(Notification)
            .filter(
                Notification.recipient_user_id == recipient,
                Notification.type == notif_type,
                Notification.source_id == source_id,
            )
            .first()
        )
        if duplicate:
            return _serialize(duplicate)

    notification = Notification(
        recipient_user_id=recipient,
        actor_user_id=body.actor_user_id,
        document_id=body.document_id,
        document_name=body.document_name,
        source_id=source_id,
        type=notif_type,
        title=title,
        body=body.body,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return _serialize(notification)


@router.get("", response_model=NotificationListResponse)
def list_notifications(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    rows = (
        db.query(Notification)
        .filter(Notification.recipient_user_id == x_user_id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    unread = sum(1 for row in rows if not row.is_read)
    return NotificationListResponse(items=[_serialize(row) for row in rows], unread_count=unread)


@router.post("/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(
    notification_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    notification = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.recipient_user_id == x_user_id)
        .first()
    )
    if not notification:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notificación no encontrada")

    if not notification.is_read:
        notification.is_read = True
        notification.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(notification)
    return _serialize(notification)


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    now = datetime.now(timezone.utc)
    (
        db.query(Notification)
        .filter(Notification.recipient_user_id == x_user_id, Notification.is_read.is_(False))
        .update({Notification.is_read: True, Notification.read_at: now}, synchronize_session=False)
    )
    db.commit()
