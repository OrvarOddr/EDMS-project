from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Document, DocumentTag, Tag
from app.schemas import CreateTagRequest, TagResponse, UpdateTagRequest

router = APIRouter(tags=["tags"])


def _require_user(x_user_id: str | None) -> str:
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return x_user_id


def _roles(value: str | None) -> set[str]:
    return {role.strip() for role in (value or "").split(",") if role.strip()}


def _document_for_actor(db: Session, document_id: str, user_id: str) -> Document:
    document_id = document_id.strip()
    if not document_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Documento requerido")
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado")
    if user_id not in {document.owner_user_id, document.created_by_user_id}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes operar sobre este documento")
    return document


def _ensure_document_editable(document: Document) -> None:
    if document.archived_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No puedes modificar un documento en papelera")


def _ensure_tag_manager(tag: Tag, user_id: str, roles: set[str]) -> None:
    if tag.created_by_user_id != user_id and "admin" not in roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes administrar esta etiqueta")


@router.get("/tags", response_model=list[TagResponse])
def list_tags(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    _require_user(x_user_id)
    return db.query(Tag).order_by(Tag.label).all()


@router.post("/tags", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
def create_tag(
    body: CreateTagRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    user_id = _require_user(x_user_id)
    tag = Tag(label=body.label, color=body.color, created_by_user_id=user_id)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


@router.put("/tags/{tag_id}", response_model=TagResponse)
def update_tag(
    tag_id: str,
    body: UpdateTagRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    user_id = _require_user(x_user_id)
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Etiqueta no encontrada")
    _ensure_tag_manager(tag, user_id, _roles(x_user_roles))
    tag.label = body.label
    tag.color = body.color
    db.commit()
    db.refresh(tag)
    return tag


@router.delete("/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(
    tag_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    user_id = _require_user(x_user_id)
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Etiqueta no encontrada")
    _ensure_tag_manager(tag, user_id, _roles(x_user_roles))
    db.query(DocumentTag).filter(DocumentTag.tag_id == tag_id).delete()
    db.delete(tag)
    db.commit()


@router.get("/documents/{document_id}/tags", response_model=list[TagResponse])
def get_document_tags(
    document_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    user_id = _require_user(x_user_id)
    _document_for_actor(db, document_id, user_id)
    tag_ids = [
        dt.tag_id
        for dt in db.query(DocumentTag).filter(DocumentTag.document_id == document_id).all()
    ]
    if not tag_ids:
        return []
    return db.query(Tag).filter(Tag.id.in_(tag_ids)).order_by(Tag.label).all()


@router.post("/documents/{document_id}/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def assign_tag(
    document_id: str,
    tag_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    user_id = _require_user(x_user_id)
    document = _document_for_actor(db, document_id, user_id)
    _ensure_document_editable(document)
    if not db.query(Tag).filter(Tag.id == tag_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Etiqueta no encontrada")
    exists = db.query(DocumentTag).filter(
        DocumentTag.document_id == document_id,
        DocumentTag.tag_id == tag_id,
    ).first()
    if not exists:
        db.add(DocumentTag(document_id=document_id, tag_id=tag_id))
        db.commit()


@router.delete("/documents/{document_id}/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_tag(
    document_id: str,
    tag_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    user_id = _require_user(x_user_id)
    document = _document_for_actor(db, document_id, user_id)
    _ensure_document_editable(document)
    dt = db.query(DocumentTag).filter(
        DocumentTag.document_id == document_id,
        DocumentTag.tag_id == tag_id,
    ).first()
    if dt:
        db.delete(dt)
        db.commit()
