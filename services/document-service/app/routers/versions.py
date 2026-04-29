import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Document, DocumentVersion
from app.schemas import (
    CreateDocumentFromFileRequest,
    DocumentCreatedFromFileResponse,
    DocumentResponse,
    DocumentVersionResponse,
    RegisterDocumentVersionRequest,
)

router = APIRouter(prefix="/documents", tags=["document-versions"])


def _to_response(version: DocumentVersion) -> DocumentVersionResponse:
    return DocumentVersionResponse(
        id=version.id,
        document_id=version.document_id,
        version_number=version.version_number,
        file_id=version.file_id,
        uploaded_by_user_id=version.uploaded_by_user_id,
        checksum=version.checksum,
        is_current=version.is_current,
        created_at=version.created_at.isoformat(),
    )


def _to_document_response(document: Document) -> DocumentResponse:
    return DocumentResponse(
        id=document.id,
        code=document.code,
        title=document.title,
        description=document.description,
        created_by_user_id=document.created_by_user_id,
        owner_user_id=document.owner_user_id,
        created_at=document.created_at.isoformat(),
    )


def _document_code(title: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", title.strip()).strip("-").upper()[:18] or "DOCUMENTO"
    return f"DOC-{datetime.now(timezone.utc):%Y%m%d}-{slug}-{uuid.uuid4().hex[:6].upper()}"


@router.post("/{document_id}/versions", response_model=DocumentVersionResponse, status_code=status.HTTP_201_CREATED)
def register_document_version(
    document_id: str,
    body: RegisterDocumentVersionRequest,
    db: Session = Depends(get_db),
):
    if not document_id.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Documento requerido")

    current_versions = db.query(DocumentVersion).filter(
        DocumentVersion.document_id == document_id,
        DocumentVersion.is_current.is_(True),
    ).all()
    for version in current_versions:
        version.is_current = False

    next_number = (
        db.query(func.max(DocumentVersion.version_number))
        .filter(DocumentVersion.document_id == document_id)
        .scalar()
        or 0
    ) + 1

    version = DocumentVersion(
        document_id=document_id,
        version_number=next_number,
        file_id=body.file_id,
        uploaded_by_user_id=body.uploaded_by_user_id,
        version_comment=body.version_comment,
        checksum=body.checksum,
        is_current=True,
    )
    db.add(version)
    db.commit()
    db.refresh(version)

    return _to_response(version)


@router.post("/from-file", response_model=DocumentCreatedFromFileResponse, status_code=status.HTTP_201_CREATED)
def create_document_from_file(
    body: CreateDocumentFromFileRequest,
    db: Session = Depends(get_db),
):
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Titulo requerido")

    document = Document(
        code=_document_code(title),
        title=title,
        description=body.description,
        owner_user_id=body.created_by_user_id,
        created_by_user_id=body.created_by_user_id,
        metadata_json={"source_file_id": body.file_id},
    )
    db.add(document)
    db.flush()

    version = DocumentVersion(
        document_id=document.id,
        version_number=1,
        file_id=body.file_id,
        uploaded_by_user_id=body.created_by_user_id,
        checksum=body.checksum,
        version_comment="Documento creado desde archivo sin asignar",
        is_current=True,
    )
    db.add(version)
    db.commit()
    db.refresh(document)
    db.refresh(version)

    return DocumentCreatedFromFileResponse(
        document=_to_document_response(document),
        version=_to_response(version),
    )


@router.get("/{document_id}/versions", response_model=list[DocumentVersionResponse])
def list_document_versions(document_id: str, db: Session = Depends(get_db)):
    versions = (
        db.query(DocumentVersion)
        .filter(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.version_number.desc())
        .all()
    )
    return [_to_response(version) for version in versions]
