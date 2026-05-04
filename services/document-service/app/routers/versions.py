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
    DocumentDeleteResponse,
    DocumentDetailFileResponse,
    DocumentDetailPermissionsResponse,
    DocumentDetailResponse,
    DocumentDetailTimelineItemResponse,
    DocumentDetailWorkflowResponse,
    DocumentResponse,
    DocumentVersionResponse,
    RegisterDocumentVersionRequest,
    UpdateDocumentMetadataRequest,
)

router = APIRouter(prefix="/documents", tags=["documents"])
internal_router = APIRouter(prefix="/internal/documents", tags=["internal-documents"])


def _to_response(version: DocumentVersion) -> DocumentVersionResponse:
    return DocumentVersionResponse(
        id=version.id,
        document_id=version.document_id,
        version_number=version.version_number,
        file_id=version.file_id,
        uploaded_by_user_id=version.uploaded_by_user_id,
        version_comment=version.version_comment,
        checksum=version.checksum,
        is_current=version.is_current,
        created_at=version.created_at.isoformat(),
    )


def _to_document_response(document: Document, workflow: dict | None = None, current_mime_type: str | None = None) -> DocumentResponse:
    metadata = document.metadata_json if isinstance(document.metadata_json, dict) else {}
    activity = metadata.get("activity") if isinstance(metadata.get("activity"), list) else []
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
        archived_at=document.archived_at.isoformat() if document.archived_at else None,
        metadata_activity=activity,
        workflow_state_code=workflow.get("state_code") if workflow else None,
        assignee_user_id=workflow.get("assignee_user_id") if workflow else None,
        current_file_mime_type=current_mime_type,
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


def _document_for_actor(db: Session, document_id: str, user_id: str) -> Document:
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado")
    if not _can_upload_version(document, user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes operar sobre este documento")
    return document


def _document_exists_for_actor(db: Session, document_id: str, user_id: str) -> Document:
    return _document_for_actor(db, document_id, user_id)


def _clean_required(value: str, field_name: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} requerido")
    return cleaned


def _record_metadata_activity(document: Document, actor_user_id: str, changed_fields: list[str]) -> None:
    metadata = document.metadata_json if isinstance(document.metadata_json, dict) else {}
    activity = metadata.get("activity") if isinstance(metadata.get("activity"), list) else []
    metadata["activity"] = [
        {
            "id": str(uuid.uuid4()),
            "actor_user_id": actor_user_id,
            "action": "metadata_updated",
            "changed_fields": changed_fields,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        *activity,
    ][:20]
    document.metadata_json = metadata


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


def _fetch_workflow_detail(document_id: str, actor_user_id: str) -> dict | None:
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.get(
                f"{settings.WORKFLOW_SERVICE_URL}/workflow/documents/{document_id}",
                headers={"X-User-Id": actor_user_id},
            )
        if response.status_code >= 400:
            return None
        return response.json()
    except httpx.HTTPError:
        return None


def _fetch_file_metadata(file_id: str, actor_user_id: str) -> dict | None:
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.get(
                f"{settings.FILE_SERVICE_URL}/files/{file_id}",
                headers={"X-User-Id": actor_user_id},
            )
        if response.status_code >= 400:
            return None
        return response.json()
    except httpx.HTTPError:
        return None


def _fetch_collaboration_timeline(document_id: str, actor_user_id: str) -> dict:
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.get(
                f"{settings.COLLABORATION_SERVICE_URL}/collaboration/documents/{document_id}/timeline",
                headers={"X-User-Id": actor_user_id},
            )
        if response.status_code >= 400:
            return {"comments": [], "history": []}
        return response.json()
    except httpx.HTTPError:
        return {"comments": [], "history": []}


def _metadata_history(document: Document) -> list[DocumentDetailTimelineItemResponse]:
    metadata = document.metadata_json if isinstance(document.metadata_json, dict) else {}
    activity = metadata.get("activity") if isinstance(metadata.get("activity"), list) else []
    history: list[DocumentDetailTimelineItemResponse] = []
    for item in activity:
        changed_fields = item.get("changed_fields") if isinstance(item.get("changed_fields"), list) else []
        history.append(
            DocumentDetailTimelineItemResponse(
                id=str(item.get("id", uuid.uuid4())),
                actor_user_id=item.get("actor_user_id"),
                action=str(item.get("action", "metadata_updated")),
                body=f"Metadata actualizada: {', '.join(str(field) for field in changed_fields)}" if changed_fields else "Metadata actualizada",
                created_at=str(item.get("created_at", document.updated_at.isoformat())),
            )
        )
    return history


def _version_history(versions: list[DocumentVersion]) -> list[DocumentDetailTimelineItemResponse]:
    return [
        DocumentDetailTimelineItemResponse(
            id=f"version-{version.id}",
            actor_user_id=version.uploaded_by_user_id,
            action="version_uploaded",
            body=version.version_comment or f"Version v{version.version_number} registrada",
            created_at=version.created_at.isoformat(),
        )
        for version in versions
    ]


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


def _current_mime_map(db: Session, document_ids: list[str]) -> dict[str, str | None]:
    if not document_ids:
        return {}
    rows = (
        db.query(DocumentVersion.document_id, DocumentVersion.mime_type)
        .filter(DocumentVersion.document_id.in_(document_ids), DocumentVersion.is_current.is_(True))
        .all()
    )
    return {doc_id: mime for doc_id, mime in rows}


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
    mime_map = _current_mime_map(db, [d.id for d in documents])
    return [_to_document_response(document, current_mime_type=mime_map.get(document.id)) for document in documents]


@router.get("/trash", response_model=list[DocumentResponse])
def list_trashed_documents(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    documents = (
        db.query(Document)
        .filter(
            Document.archived_at.is_not(None),
            (Document.owner_user_id == actor_user_id) | (Document.created_by_user_id == actor_user_id),
        )
        .order_by(Document.archived_at.desc())
        .all()
    )
    mime_map = _current_mime_map(db, [d.id for d in documents])
    return [_to_document_response(document, current_mime_type=mime_map.get(document.id)) for document in documents]


@router.get("/{document_id}", response_model=DocumentDetailResponse)
def get_document_detail(
    document_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    document = _document_for_actor(db, document_id.strip(), actor_user_id)
    workflow_raw = _fetch_workflow_detail(document.id, actor_user_id) or {}
    workflow = DocumentDetailWorkflowResponse(
        state_code=workflow_raw.get("state_code"),
        assignee_user_id=workflow_raw.get("assignee_user_id"),
        assignment_role_code=workflow_raw.get("assignment_role_code"),
        assignments=workflow_raw.get("assignments") if isinstance(workflow_raw.get("assignments"), list) else [],
    )

    versions = (
        db.query(DocumentVersion)
        .filter(DocumentVersion.document_id == document.id)
        .order_by(DocumentVersion.version_number.desc())
        .all()
    )
    files: list[DocumentDetailFileResponse] = []
    for version in versions:
        metadata = _fetch_file_metadata(version.file_id, actor_user_id) or {}
        files.append(
            DocumentDetailFileResponse(
                **_to_response(version).model_dump(),
                original_filename=metadata.get("original_filename"),
                mime_type=metadata.get("mime_type"),
                size_bytes=metadata.get("size_bytes"),
                uploaded_at=metadata.get("uploaded_at"),
            )
        )

    collaboration = _fetch_collaboration_timeline(document.id, actor_user_id)
    comments = collaboration.get("comments") if isinstance(collaboration.get("comments"), list) else []
    collaboration_history = collaboration.get("history") if isinstance(collaboration.get("history"), list) else []
    history_items = [
        *[DocumentDetailTimelineItemResponse(**item) for item in collaboration_history if isinstance(item, dict)],
        *_metadata_history(document),
        *_version_history(versions),
    ]
    history_items.sort(key=lambda item: item.created_at, reverse=True)

    can_operate = document.archived_at is None and _can_upload_version(document, actor_user_id)
    return DocumentDetailResponse(
        document=_to_document_response(document, workflow_raw),
        workflow=workflow,
        files=files,
        comments=[DocumentDetailTimelineItemResponse(**item) for item in comments if isinstance(item, dict)],
        history=history_items,
        permissions=DocumentDetailPermissionsResponse(
            can_edit_metadata=can_operate,
            can_upload_version=can_operate,
            can_move_to_trash=can_operate,
            can_download_file=document.archived_at is None,
            can_comment=document.archived_at is None,
        ),
    )


@router.patch("/{document_id}/metadata", response_model=DocumentResponse)
def update_document_metadata(
    document_id: str,
    body: UpdateDocumentMetadataRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    document = _document_for_actor(db, document_id.strip(), actor_user_id)
    if document.archived_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No puedes editar un documento en papelera")

    title = _clean_required(body.title, "Titulo")
    description = _clean_required(body.description, "Descripcion")
    document_type_id = _clean_required(body.document_type_id, "Tipo documental")
    expedient_id = body.expedient_id.strip() if body.expedient_id else None
    confidentiality_level = _clean_required(body.confidentiality_level, "Confidencialidad")

    updates = {
        "title": title,
        "description": description,
        "document_type_id": document_type_id,
        "expedient_id": expedient_id or None,
        "confidentiality_level": confidentiality_level,
    }
    changed_fields = [
        field
        for field, value in updates.items()
        if getattr(document, field) != value
    ]

    if not changed_fields:
        return _to_document_response(document)

    for field, value in updates.items():
        setattr(document, field, value)
    document.updated_at = datetime.now(timezone.utc)
    _record_metadata_activity(document, actor_user_id, changed_fields)

    db.commit()
    db.refresh(document)
    return _to_document_response(document)


@router.patch("/{document_id}/trash", response_model=DocumentResponse)
def move_document_to_trash(
    document_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    document = _document_for_actor(db, document_id.strip(), actor_user_id)
    if document.archived_at is None:
        document.archived_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(document)
    return _to_document_response(document)


@router.patch("/{document_id}/restore", response_model=DocumentResponse)
def restore_document_from_trash(
    document_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    document = _document_for_actor(db, document_id.strip(), actor_user_id)
    if document.archived_at is not None:
        document.archived_at = None
        db.commit()
        db.refresh(document)
    return _to_document_response(document)


@router.delete("/{document_id}", response_model=DocumentDeleteResponse)
def delete_trashed_document(
    document_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    document = _document_for_actor(db, document_id.strip(), actor_user_id)
    if document.archived_at is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Envia el documento a papelera antes de eliminarlo")

    db.query(DocumentVersion).filter(DocumentVersion.document_id == document.id).delete(synchronize_session=False)
    db.delete(document)
    db.commit()
    return DocumentDeleteResponse(deleted_count=1)


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

    file_meta = _fetch_file_metadata(body.file_id, actor_user_id) or {}
    version = DocumentVersion(
        document_id=document_id,
        version_number=next_number,
        file_id=body.file_id,
        uploaded_by_user_id=body.uploaded_by_user_id,
        version_comment=body.version_comment,
        checksum=body.checksum,
        mime_type=file_meta.get("mime_type"),
        original_filename=file_meta.get("original_filename"),
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
    description = _clean_required(body.description, "Descripcion")
    document_type_id = _clean_required(body.document_type_id, "Tipo documental")
    confidentiality_level = _clean_required(body.confidentiality_level, "Confidencialidad")
    expedient_id = body.expedient_id.strip() if body.expedient_id else None

    document = Document(
        code=_document_code(title),
        title=title,
        description=description,
        document_type_id=document_type_id,
        expedient_id=expedient_id or None,
        confidentiality_level=confidentiality_level,
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

    file_meta = _fetch_file_metadata(body.file_id, actor_user_id) or {}
    version = DocumentVersion(
        document_id=document.id,
        version_number=1,
        file_id=body.file_id,
        uploaded_by_user_id=actor_user_id,
        checksum=body.checksum,
        version_comment="Documento creado desde archivo sin asignar",
        mime_type=file_meta.get("mime_type"),
        original_filename=file_meta.get("original_filename"),
        is_current=True,
    )
    db.add(version)
    db.commit()
    db.refresh(document)
    db.refresh(version)

    return DocumentCreatedFromFileResponse(
        document=_to_document_response(document, workflow, current_mime_type=file_meta.get("mime_type")),
        version=_to_response(version),
    )


@internal_router.get("/{document_id}/access")
def check_document_access(
    document_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    document = _document_exists_for_actor(db, document_id.strip(), actor_user_id)
    return {"document_id": document.id, "can_access": True}


@router.get("/{document_id}/versions", response_model=list[DocumentVersionResponse])
def list_document_versions(
    document_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    _document_for_actor(db, document_id.strip(), actor_user_id)
    versions = (
        db.query(DocumentVersion)
        .filter(DocumentVersion.document_id == document_id.strip())
        .order_by(DocumentVersion.version_number.desc())
        .all()
    )
    return [_to_response(version) for version in versions]
