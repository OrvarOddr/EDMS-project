import json
import re
import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Comment

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


class CreateCommentRequest(BaseModel):
    body: str
    version_id: str | None = None


def _extract_mentions(text: str) -> list[str]:
    return list(dict.fromkeys(re.findall(r'@([\w\-]+)', text)))


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

    mentions = _extract_mentions(text)
    comment = Comment(
        document_id=document_id,
        author_user_id=x_user_id,
        body=text,
        version_id=version_id,
        mentions=json.dumps(mentions) if mentions else None,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

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
        )
        for c in comments_rows
    ]
    history = sorted(
        workflow_history + comment_activities,
        key=lambda x: x.created_at,
        reverse=True,
    )

    return DocumentTimelineResponse(comments=comments, history=history)
