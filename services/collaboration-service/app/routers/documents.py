import json
import re
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Comment, Notification

router = APIRouter(prefix="/collaboration/documents", tags=["collaboration-documents"])


class TimelineItemResponse(BaseModel):
    id: str
    actor_user_id: str | None = None
    action: str
    body: str | None = None
    created_at: str
    resolved_at: str | None = None
    resolved_by_user_id: str | None = None


class DocumentTimelineResponse(BaseModel):
    comments: list[TimelineItemResponse] = Field(default_factory=list)
    history: list[TimelineItemResponse] = Field(default_factory=list)


class CreateCommentRequest(BaseModel):
    body: str
    version_id: str | None = None
    mentioned_user_ids: list[str] = Field(default_factory=list)


def _extract_mentions(text: str) -> list[str]:
    return list(dict.fromkeys(re.findall(r'@([\w.\-]+)', text)))


def _assert_document_permission(
    document_id: str,
    user_id: str,
    permission: str,
    version_id: str | None = None,
) -> None:
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.get(
                f"{settings.DOCUMENT_SERVICE_URL}/internal/documents/{document_id}/access",
                headers={"X-User-Id": user_id},
                params=(
                    {"permission": permission, "version_id": version_id}
                    if version_id
                    else {"permission": permission}
                ),
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo validar permiso sobre el documento",
        ) from exc

    if response.status_code in {
        status.HTTP_401_UNAUTHORIZED,
        status.HTTP_403_FORBIDDEN,
        status.HTTP_404_NOT_FOUND,
    }:
        raise HTTPException(status_code=response.status_code, detail="No tienes permiso sobre este documento")
    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="document-service rechazo la validacion de permiso",
        )


def _fetch_workflow_history(document_id: str) -> list[TimelineItemResponse]:
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.get(
                f"{settings.WORKFLOW_SERVICE_URL}/internal/workflow/documents/{document_id}/history",
            )
        if response.status_code >= 400:
            return []
        return [TimelineItemResponse(**item) for item in response.json()]
    except httpx.HTTPError:
        return []


def _fetch_active_assignment_user_ids(document_id: str) -> list[str]:
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.get(
                f"{settings.WORKFLOW_SERVICE_URL}/internal/workflow/documents/{document_id}/assignments",
            )
        if response.status_code >= 400:
            return []
        user_ids: list[str] = []
        for item in response.json():
            user_id = str(item.get("user_id", "")).strip()
            if user_id and user_id not in user_ids:
                user_ids.append(user_id)
        return user_ids
    except httpx.HTTPError:
        return []


def _fetch_document_name(document_id: str) -> str | None:
    try:
        with httpx.Client(timeout=3.0) as client:
            response = client.get(
                f"{settings.DOCUMENT_SERVICE_URL}/internal/documents/{document_id}/name",
            )
        if response.status_code == 200:
            return response.json().get("name")
    except httpx.HTTPError:
        pass
    return None


def _create_notification(
    db: Session,
    *,
    recipient_user_id: str,
    notif_type: str,
    title: str,
    actor_user_id: str,
    document_id: str,
    source_id: str,
    document_name: str | None = None,
    body: str | None = None,
) -> None:
    duplicate = (
        db.query(Notification)
        .filter(
            Notification.recipient_user_id == recipient_user_id,
            Notification.type == notif_type,
            Notification.source_id == source_id,
        )
        .first()
    )
    if duplicate:
        return

    db.add(
        Notification(
            recipient_user_id=recipient_user_id,
            actor_user_id=actor_user_id,
            document_id=document_id,
            document_name=document_name,
            source_id=source_id,
            type=notif_type,
            title=title,
            body=body,
        )
    )


@router.post("/{document_id}/comments", response_model=TimelineItemResponse, status_code=status.HTTP_201_CREATED)
def create_comment(
    document_id: str,
    body: CreateCommentRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")
    document_id = document_id.strip()
    if not document_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Documento requerido")
    text = body.body.strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El comentario no puede estar vacío")

    version_id = body.version_id.strip() if body.version_id and body.version_id.strip() else None
    _assert_document_permission(document_id, x_user_id, permission="comment", version_id=version_id)

    raw_mentions = _extract_mentions(text)
    mentioned_user_ids = [
        user_id.strip()
        for user_id in body.mentioned_user_ids
        if user_id.strip() and user_id.strip() != x_user_id
    ]
    mentioned_user_ids = list(dict.fromkeys(mentioned_user_ids))
    comment = Comment(
        document_id=document_id,
        author_user_id=x_user_id,
        body=text,
        version_id=version_id,
        mentions=json.dumps(raw_mentions) if raw_mentions else None,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    doc_name = _fetch_document_name(document_id)
    active_assignment_user_ids = _fetch_active_assignment_user_ids(document_id)
    mentioned_set = set(mentioned_user_ids)
    for recipient_user_id in active_assignment_user_ids:
        if recipient_user_id == x_user_id or recipient_user_id in mentioned_set:
            continue
        _create_notification(
            db,
            recipient_user_id=recipient_user_id,
            notif_type="nuevo_comentario",
            title="Nuevo comentario en un documento asignado",
            actor_user_id=x_user_id,
            document_id=document_id,
            document_name=doc_name,
            source_id=comment.id,
            body=text[:240],
        )

    for recipient_user_id in mentioned_user_ids:
        _create_notification(
            db,
            recipient_user_id=recipient_user_id,
            notif_type="mencion",
            title="Te mencionaron en un comentario",
            actor_user_id=x_user_id,
            document_id=document_id,
            document_name=doc_name,
            source_id=comment.id,
            body=text[:240],
        )
    db.commit()

    return TimelineItemResponse(
        id=comment.id,
        actor_user_id=comment.author_user_id,
        action="comment",
        body=comment.body,
        created_at=comment.created_at.isoformat(),
    )


@router.get("/{document_id}/timeline", response_model=DocumentTimelineResponse)
def get_document_timeline(
    document_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")
    document_id = document_id.strip()
    if not document_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Documento requerido")
    _assert_document_permission(document_id, x_user_id, permission="view")

    comments_rows = (
        db.query(Comment)
        .filter(Comment.document_id == document_id)
        .order_by(Comment.created_at.desc())
        .all()
    )
    comments = [
        TimelineItemResponse(
            id=c.id,
            actor_user_id=c.author_user_id,
            action="comment",
            body=c.body,
            created_at=c.created_at.isoformat(),
            resolved_at=c.resolved_at.isoformat() if c.resolved_at else None,
            resolved_by_user_id=c.resolved_by_user_id,
        )
        for c in comments_rows
    ]

    workflow_history = _fetch_workflow_history(document_id)

    comment_activities = [
        TimelineItemResponse(
            id=c.id,
            actor_user_id=c.author_user_id,
            action="comment",
            body=c.body,
            created_at=c.created_at.isoformat(),
            resolved_at=c.resolved_at.isoformat() if c.resolved_at else None,
            resolved_by_user_id=c.resolved_by_user_id,
        )
        for c in comments_rows
    ]
    history = sorted(
        workflow_history + comment_activities,
        key=lambda x: x.created_at,
        reverse=True,
    )

    return DocumentTimelineResponse(comments=comments, history=history)


@router.post("/{document_id}/comments/{comment_id}/resolve", response_model=TimelineItemResponse)
def resolve_comment(
    document_id: str,
    comment_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    """US-022: marcar un comentario como resuelto.

    Permite resolverlo al autor del comentario o a cualquier usuario con
    permiso `comment` sobre el documento (que incluye encargado, asignados
    y, por bypass, admin). Conserva el comentario y agrega resolved_at +
    resolved_by_user_id.
    """
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")
    document_id = document_id.strip()
    comment_id = comment_id.strip()
    if not document_id or not comment_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Documento y comentario requeridos")

    comment = (
        db.query(Comment)
        .filter(Comment.id == comment_id, Comment.document_id == document_id)
        .first()
    )
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comentario no encontrado")

    # Autor puede resolver su propio comentario sin pedirle permiso al gateway.
    if comment.author_user_id != x_user_id:
        _assert_document_permission(document_id, x_user_id, permission="comment")

    if comment.resolved_at is None:
        comment.resolved_at = datetime.now(timezone.utc)
        comment.resolved_by_user_id = x_user_id
        db.commit()
        db.refresh(comment)

    return TimelineItemResponse(
        id=comment.id,
        actor_user_id=comment.author_user_id,
        action="comment",
        body=comment.body,
        created_at=comment.created_at.isoformat(),
        resolved_at=comment.resolved_at.isoformat() if comment.resolved_at else None,
        resolved_by_user_id=comment.resolved_by_user_id,
    )


@router.post("/{document_id}/comments/{comment_id}/unresolve", response_model=TimelineItemResponse)
def unresolve_comment(
    document_id: str,
    comment_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    """US-022: reabrir un comentario resuelto."""
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")
    document_id = document_id.strip()
    comment_id = comment_id.strip()
    if not document_id or not comment_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Documento y comentario requeridos")

    comment = (
        db.query(Comment)
        .filter(Comment.id == comment_id, Comment.document_id == document_id)
        .first()
    )
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comentario no encontrado")
    if comment.author_user_id != x_user_id:
        _assert_document_permission(document_id, x_user_id, permission="comment")

    if comment.resolved_at is not None:
        comment.resolved_at = None
        comment.resolved_by_user_id = None
        db.commit()
        db.refresh(comment)

    return TimelineItemResponse(
        id=comment.id,
        actor_user_id=comment.author_user_id,
        action="comment",
        body=comment.body,
        created_at=comment.created_at.isoformat(),
        resolved_at=None,
        resolved_by_user_id=None,
    )
