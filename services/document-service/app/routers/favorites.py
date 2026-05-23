"""Favoritos por usuario.

Cada usuario mantiene su propia lista; no afecta autorizacion ni se
comparte con otros. Idempotente: marcar dos veces o desmarcar sin haber
marcado no es error.
"""
from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DocumentFavorite
from app.routers.versions import _document_for_actor, _require_user

router = APIRouter(prefix="/documents", tags=["favorites"])


@router.post("/{document_id}/favorite", status_code=status.HTTP_200_OK)
def add_favorite(
    document_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    document = _document_for_actor(
        db,
        document_id.strip(),
        actor_user_id,
        permission="view",
        x_user_roles=x_user_roles,
    )
    existing = (
        db.query(DocumentFavorite)
        .filter(
            DocumentFavorite.user_id == actor_user_id,
            DocumentFavorite.document_id == document.id,
        )
        .first()
    )
    if not existing:
        db.add(DocumentFavorite(user_id=actor_user_id, document_id=document.id))
        try:
            db.commit()
        except IntegrityError:
            # Carrera con otra marca simultanea: idempotente.
            db.rollback()
    return {"document_id": document.id, "is_starred": True}


@router.delete("/{document_id}/favorite", status_code=status.HTTP_204_NO_CONTENT)
def remove_favorite(
    document_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    document_id = document_id.strip()
    if not document_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Documento requerido")
    db.query(DocumentFavorite).filter(
        DocumentFavorite.user_id == actor_user_id,
        DocumentFavorite.document_id == document_id,
    ).delete(synchronize_session=False)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
