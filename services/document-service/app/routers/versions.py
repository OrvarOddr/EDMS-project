import re
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Document, DocumentVersion
from app.schemas import (
    CreateDocumentRequest,
    CreateDocumentFromFileRequest,
    DocumentCreatedFromFileResponse,
    DocumentResponse,
    DocumentVersionResponse,
    RegisterDocumentVersionRequest,
)

router = APIRouter(prefix="/documents", tags=["documents"])


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


def _to_document_response(document: Document, workflow: dict | None = None) -> DocumentResponse:
    return DocumentResponse(
        id=document.id,
        code=document.code,
        title=document.title,
        description=document.description,
        document_type_id=document.document_type_id,
        expedient_id=document.expedient_id,
        confidentiality_level=document.confidentiality_level,
        created_by_user_id=document.created_by_user_id,
        owner_user_id=document.owner_user_id,
        created_at=document.created_at.isoformat(),
        updated_at=document.updated_at.isoformat(),
        workflow_state_code=workflow.get("state_code") if workflow else None,
        assignee_user_id=workflow.get("assignee_user_id") if workflow else None,
    )


def _document_code(title: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", title.strip()).strip("-").upper()[:18] or "DOCUMENTO"
    return f"DOC-{datetime.now(timezone.utc):%Y%m%d}-{slug}-{uuid.uuid4().hex[:6].upper()}"


def _require_user(x_user_id: str | None) -> str:
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")
    return x_user_id


def _can_upload_version(document: Document, user_id: str) -> bool:
    # Permisos documentales finos vendran en US-005/US-006; por ahora solo dueno/creador.
    return user_id in {document.owner_user_id, document.created_by_user_id}


def _clean_required(value: str, field_name: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} requerido")
    return cleaned


def _bootstrap_workflow(document_id: str, actor_user_id: str) -> dict:
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.post(
                f"{settings.WORKFLOW_SERVICE_URL}/internal/workflow/documents/bootstrap",
                json={
                    "document_id": document_id,
                    "created_by_user_id": actor_user_id,
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo crear el estado inicial del documento",
        ) from exc

    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="workflow-service rechazo la creacion del estado inicial",
        )
    return response.json()


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
def create_document(
    body: CreateDocumentRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    title = _clean_required(body.title, "Titulo")
    description = _clean_required(body.description, "Descripcion")
    document_type_id = _clean_required(body.document_type_id, "Tipo documental")
    expedient_id = body.expedient_id.strip() if body.expedient_id else None

    document = Document(
        code=_document_code(title),
        title=title,
        description=description,
        document_type_id=document_type_id,
        expedient_id=expedient_id or None,
        confidentiality_level=body.confidentiality_level,
        owner_user_id=actor_user_id,
        created_by_user_id=actor_user_id,
        metadata_json={"source": "manual_creation"},
    )
    db.add(document)
    db.flush()

    try:
        workflow = _bootstrap_workflow(document.id, actor_user_id)
    except HTTPException:
        db.rollback()
        raise
    db.commit()
    db.refresh(document)

    return _to_document_response(document, workflow)


@router.get("", response_model=list[DocumentResponse])
def list_documents(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    documents = (
        db.query(Document)
        .filter(
            Document.archived_at.is_(None),
            (Document.owner_user_id == actor_user_id) | (Document.created_by_user_id == actor_user_id),
        )
        .order_by(Document.created_at.desc())
        .all()
    )
    return [_to_document_response(document) for document in documents]


@router.post("/{document_id}/versions", response_model=DocumentVersionResponse, status_code=status.HTTP_201_CREATED)
def register_document_version(
    document_id: str,
    body: RegisterDocumentVersionRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    document_id = document_id.strip()
    if not document_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Documento requerido")
    if body.uploaded_by_user_id != actor_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes registrar una version a nombre de otro usuario")

    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado")
    if not _can_upload_version(document, actor_user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes subir versiones de este documento")

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
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    if body.created_by_user_id != actor_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes crear documentos a nombre de otro usuario")

    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Titulo requerido")

    document = Document(
        code=_document_code(title),
        title=title,
        description=body.description,
        owner_user_id=actor_user_id,
        created_by_user_id=actor_user_id,
        metadata_json={"source_file_id": body.file_id},
    )
    db.add(document)
    db.flush()
    try:
        workflow = _bootstrap_workflow(document.id, actor_user_id)
    except HTTPException:
        db.rollback()
        raise

    version = DocumentVersion(
        document_id=document.id,
        version_number=1,
        file_id=body.file_id,
        uploaded_by_user_id=actor_user_id,
        checksum=body.checksum,
        version_comment="Documento creado desde archivo sin asignar",
        is_current=True,
    )
    db.add(version)
    db.commit()
    db.refresh(document)
    db.refresh(version)

    return DocumentCreatedFromFileResponse(
        document=_to_document_response(document, workflow),
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
