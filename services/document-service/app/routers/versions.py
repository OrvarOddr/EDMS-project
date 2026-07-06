import re
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Document, DocumentFavorite, DocumentVersion, Expedient
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


def _to_document_response(
    document: Document,
    workflow: dict | None = None,
    current_mime_type: str | None = None,
    is_starred: bool = False,
) -> DocumentResponse:
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
        due_date=document.due_at.isoformat() if document.due_at else None,
        metadata_activity=activity,
        workflow_state_code=workflow.get("state_code") if workflow else None,
        assignee_user_id=workflow.get("assignee_user_id") if workflow else None,
        assigned_user_ids=workflow.get("assigned_user_ids", []) if workflow else [],
        current_file_mime_type=current_mime_type,
        is_starred=is_starred,
        folder_id=document.folder_id,
    )


def _document_code(title: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", title.strip()).strip("-").upper()[:18] or "DOCUMENTO"
    return f"DOC-{datetime.now(timezone.utc):%Y%m%d}-{slug}-{uuid.uuid4().hex[:6].upper()}"


def _require_user(x_user_id: str | None) -> str:
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")
    return x_user_id


def _is_admin(x_user_roles: str | None) -> bool:
    """Detecta admin desde el header X-User-Roles seteado por api-gateway.

    Modo admin: bypass de los chequeos de visibilidad y permisos; un admin
    puede operar sobre cualquier documento del workspace.
    """
    if not x_user_roles:
        return False
    return "admin" in {role.strip() for role in x_user_roles.split(",") if role.strip()}


def _can_upload_version(document: Document, user_id: str) -> bool:
    # Permisos documentales finos vendran en US-005/US-006; por ahora solo dueno/creador.
    return user_id in {document.owner_user_id, document.created_by_user_id}


def _workflow_assigned_user_ids(workflow: dict | None) -> list[str]:
    if not workflow:
        return []
    assigned = workflow.get("assigned_user_ids")
    return [str(user_id) for user_id in assigned] if isinstance(assigned, list) else []


def _can_view_document(document: Document, user_id: str, workflow: dict | None = None, is_admin: bool = False) -> bool:
    if is_admin:
        return True
    if _can_upload_version(document, user_id):
        return True
    if workflow and workflow.get("assignee_user_id") == user_id:
        return True
    return user_id in _workflow_assigned_user_ids(workflow)


_SUPPORTED_PERMISSIONS: frozenset[str] = frozenset({
    "view",
    "download",
    "comment",
    "edit_metadata",
    "upload_version",
    "move_state",
    "move_to_trash",
    "restore",
    "delete",
    "assign_assignee",
    "approve",
    "manage_permissions",
    "share",
})


def _fetch_user_grants(document_id: str, user_id: str) -> set[str]:
    """US-005: permisos explicitos otorgados al usuario sobre el documento.

    Best-effort: si collaboration-service no responde, devuelve un set vacio
    para no romper la operacion (los caminos de owner / workflow siguen
    funcionando).
    """
    try:
        with httpx.Client(timeout=3.0) as client:
            response = client.get(
                f"{settings.COLLABORATION_SERVICE_URL}/internal/collaboration/documents/{document_id}/permissions",
                params={"user_id": user_id},
            )
        if response.status_code >= 400:
            return set()
        return set(response.json().get("permissions", []))
    except httpx.HTTPError:
        return set()


def _has_document_permission(
    document: Document,
    user_id: str,
    permission: str,
    workflow: dict | None = None,
    grants: set[str] | None = None,
    is_admin: bool = False,
) -> bool:
    if permission not in _SUPPORTED_PERMISSIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Permiso documental no soportado")

    # Bypass admin: puede operar sobre cualquier documento del workspace.
    # En documentos archivados se bloquea la edicion de contenido/metadata,
    # pero restore/delete deben funcionar (son justamente las acciones que
    # tienen sentido sobre un doc en papelera).
    _ARCHIVED_BLOCKED_FOR_ADMIN = {"edit_metadata", "upload_version", "move_state", "move_to_trash", "approve", "share"}
    if is_admin:
        if document.archived_at is not None and permission in _ARCHIVED_BLOCKED_FOR_ADMIN:
            return False
        return True

    # US-005: permisos explicitos otorgados via collaboration-service.
    if grants and permission in grants:
        if document.archived_at is not None and permission in _ARCHIVED_BLOCKED_FOR_ADMIN:
            return False
        return True

    if permission in {"view", "download", "comment"}:
        return document.archived_at is None and _can_view_document(document, user_id, workflow)
    if permission in {
        "edit_metadata",
        "upload_version",
        "move_state",
        "move_to_trash",
        "restore",
        "delete",
        "approve",
        "manage_permissions",
        "share",
    }:
        return _can_upload_version(document, user_id)
    if permission == "assign_assignee":
        return document.archived_at is None and _can_upload_version(document, user_id)
    return False


def _document_for_actor(db: Session, document_id: str, user_id: str, permission: str = "view", x_user_roles: str | None = None) -> Document:
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado")
    is_admin = _is_admin(x_user_roles)
    if is_admin:
        # El admin pasa todo (excepto escritura sobre archivado, ya manejado en _has_document_permission).
        if _has_document_permission(document, user_id, permission, None, None, is_admin=True):
            return document
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes operar sobre este documento")
    workflow = None
    if permission in {"view", "download", "comment"}:
        workflow = _fetch_batch_workflow_summaries([document.id]).get(document.id, {})
    grants: set[str] = set()
    # Si los checks locales no autorizan, consultamos los grants explicitos
    # (US-005). Lo hacemos solo cuando hace falta para no pagar el RTT en
    # cada operacion del owner.
    if not _has_document_permission(document, user_id, permission, workflow):
        grants = _fetch_user_grants(document_id, user_id)
        if not _has_document_permission(document, user_id, permission, workflow, grants):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes operar sobre este documento")
    return document


def _document_exists_for_actor(db: Session, document_id: str, user_id: str, permission: str = "view", x_user_roles: str | None = None) -> Document:
    return _document_for_actor(db, document_id, user_id, permission=permission, x_user_roles=x_user_roles)


def _clean_required(value: str, field_name: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} requerido")
    return cleaned


def _record_metadata_activity(document: Document, actor_user_id: str, changed_fields: list[str]) -> None:
    # Copia: reasignar el MISMO dict no marca la columna JSON como modificada
    # en SQLAlchemy y la actividad no se persistia.
    metadata = dict(document.metadata_json) if isinstance(document.metadata_json, dict) else {}
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


def _metadata_value_label(field: str, value: object) -> str:
    if value is None or value == "":
        return "sin valor"
    if field == "confidentiality_level":
        labels = {
            "publico_interno": "Publico interno",
            "confidencial": "Confidencial",
            "reservado": "Reservado",
        }
        return labels.get(str(value), str(value))
    if isinstance(value, datetime):
        return value.date().isoformat()
    return str(value)


def _metadata_change_body(document_title: str, change_details: dict[str, tuple[object, object]]) -> str:
    parts = []
    for field, (old_value, new_value) in change_details.items():
        if field == "due_date":
            continue
        label = _metadata_field_label(field)
        old_label = _metadata_value_label(field, old_value)
        new_label = _metadata_value_label(field, new_value)
        parts.append(f"{label} cambio de \"{old_label}\" a \"{new_label}\"")

    if not parts:
        return f"Documento \"{document_title}\": metadata actualizada."
    return f"Documento \"{document_title}\": {'; '.join(parts)}."


def _notify_metadata_change(
    document_id: str,
    document_title: str,
    actor_user_id: str,
    change_details: dict[str, tuple[object, object]],
) -> None:
    """Best-effort: publica cambios descriptivos en la actividad reciente."""
    visible_fields = [field for field in change_details if field != "due_date"]
    if not visible_fields:
        return

    body_text = _metadata_change_body(document_title, change_details)
    source_id = f"metadata:{document_id}:{uuid.uuid4()}"

    try:
        with httpx.Client(timeout=5.0) as client:
            client.post(
                f"{settings.COLLABORATION_SERVICE_URL}/internal/collaboration/notifications",
                json={
                    "recipient_user_id": actor_user_id,
                    "actor_user_id": actor_user_id,
                    "document_id": document_id,
                    "document_name": document_title,
                    "source_id": source_id,
                    "type": "metadata_actualizada",
                    "title": "Metadata actualizada",
                    "body": body_text,
                },
            )
    except httpx.HTTPError:
        pass


def _bootstrap_workflow(document_id: str, actor_user_id: str, assignee_user_id: str | None = None) -> dict:
    payload = {
        "document_id": document_id,
        "created_by_user_id": actor_user_id,
    }
    if assignee_user_id:
        payload["assignee_user_id"] = assignee_user_id

    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.post(
                f"{settings.WORKFLOW_SERVICE_URL}/internal/workflow/documents/bootstrap",
                json=payload,
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


def _fetch_permission_history(document_id: str) -> list[dict]:
    """US-025: eventos de permission_granted/revoked desde collaboration-service.

    Best-effort: si el servicio no responde retornamos lista vacia para no
    romper la respuesta del detalle del documento.
    """
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.get(
                f"{settings.COLLABORATION_SERVICE_URL}/internal/collaboration/documents/{document_id}/permissions/history",
            )
        if response.status_code >= 400:
            return []
        events = response.json().get("events") or []
        return events if isinstance(events, list) else []
    except httpx.HTTPError:
        return []


def _fetch_workflow_history(document_id: str) -> list[dict]:
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.get(f"{settings.WORKFLOW_SERVICE_URL}/internal/workflow/documents/{document_id}/history")
        if response.status_code >= 400:
            return []
        history = response.json()
        return history if isinstance(history, list) else []
    except httpx.HTTPError:
        return []


def _fetch_batch_workflow_states(document_ids: list[str]) -> dict[str, str]:
    if not document_ids:
        return {}
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.post(
                f"{settings.WORKFLOW_SERVICE_URL}/internal/workflow/documents/batch-states",
                json={"document_ids": document_ids},
            )
        if response.status_code >= 400:
            return {}
        return response.json().get("states", {})
    except httpx.HTTPError:
        return {}


def _fetch_batch_workflow_summaries(document_ids: list[str]) -> dict[str, dict]:
    if not document_ids:
        return {}
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.post(
                f"{settings.WORKFLOW_SERVICE_URL}/internal/workflow/documents/batch-summaries",
                json={"document_ids": document_ids},
            )
        if response.status_code >= 400:
            return {}
        summaries = response.json().get("summaries", {})
        return summaries if isinstance(summaries, dict) else {}
    except httpx.HTTPError:
        return {}


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
        field_labels = [_metadata_field_label(str(field)) for field in changed_fields]
        history.append(
            DocumentDetailTimelineItemResponse(
                id=str(item.get("id", uuid.uuid4())),
                actor_user_id=item.get("actor_user_id"),
                action=str(item.get("action", "metadata_updated")),
                body=f"Metadata actualizada: {', '.join(field_labels)}" if field_labels else "Metadata actualizada",
                created_at=str(item.get("created_at", document.updated_at.isoformat())),
            )
        )
    return history


def _metadata_field_label(field: str) -> str:
    labels = {
        "title": "titulo",
        "description": "descripcion",
        "document_type_id": "tipo documental",
        "expedient_id": "expediente",
        "confidentiality_level": "confidencialidad",
        "due_date": "fecha de vencimiento",
    }
    return labels.get(field, field)


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
    assignee_user_id = body.assignee_user_id.strip() if body.assignee_user_id else None
    due_at = _parse_due_date(body.due_date)

    document = Document(
        code=_document_code(title),
        title=title,
        description=description,
        document_type_id=document_type_id,
        expedient_id=expedient_id or None,
        confidentiality_level=body.confidentiality_level,
        owner_user_id=actor_user_id,
        created_by_user_id=actor_user_id,
        due_at=due_at,
        metadata_json={"source": "manual_creation"},
    )
    if due_at is not None:
        _record_metadata_activity(document, actor_user_id, ["due_date"])
    db.add(document)
    db.flush()

    try:
        workflow = _bootstrap_workflow(document.id, actor_user_id, assignee_user_id)
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


def _starred_set(db: Session, user_id: str, document_ids: list[str]) -> set[str]:
    """Devuelve los document_ids favoritos del usuario dentro de la lista."""
    if not user_id or not document_ids:
        return set()
    rows = (
        db.query(DocumentFavorite.document_id)
        .filter(
            DocumentFavorite.user_id == user_id,
            DocumentFavorite.document_id.in_(document_ids),
        )
        .all()
    )
    return {row[0] for row in rows}


def _escape_like_query(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _clean_optional(value: str | None) -> str | None:
    cleaned = value.strip() if value else ""
    return cleaned or None


def _modified_after_filter(value: str | None) -> datetime | None:
    cleaned = _clean_optional(value)
    if not cleaned:
        return None

    now = datetime.now(timezone.utc)
    if cleaned == "hoy":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if cleaned == "semana":
        return now - timedelta(days=7)
    if cleaned == "mes":
        return now - timedelta(days=30)
    if cleaned == "ano":
        return now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Filtro de fecha invalido")


def _matches_workflow_filters(
    workflow: dict | None,
    state_filter: str | None = None,
    assignee_filter: str | None = None,
    assigned_filter: str | None = None,
) -> bool:
    if not any([state_filter, assignee_filter, assigned_filter]):
        return True
    workflow = workflow or {}
    if state_filter and workflow.get("state_code") != state_filter:
        return False
    if assignee_filter and workflow.get("assignee_user_id") != assignee_filter:
        return False
    if assigned_filter and assigned_filter not in _workflow_assigned_user_ids(workflow):
        return False
    return True


def _filter_visible_documents(
    documents: list[Document],
    workflow_map: dict[str, dict],
    actor_user_id: str,
    state_filter: str | None = None,
    assignee_filter: str | None = None,
    assigned_filter: str | None = None,
    is_admin: bool = False,
) -> list[Document]:
    visible_documents: list[Document] = []
    for document in documents:
        workflow = workflow_map.get(document.id, {})
        if not _can_view_document(document, actor_user_id, workflow, is_admin=is_admin):
            continue
        if not _matches_workflow_filters(workflow, state_filter, assignee_filter, assigned_filter):
            continue
        visible_documents.append(document)
    return visible_documents


@router.get("", response_model=list[DocumentResponse])
def list_documents(
    q: str | None = Query(default=None, max_length=100),
    document_type_id: str | None = Query(default=None, max_length=80),
    state_code: str | None = Query(default=None, max_length=40),
    assignee_user_id: str | None = Query(default=None, max_length=80),
    assigned_user_id: str | None = Query(default=None, max_length=80),
    date: str | None = Query(default=None, max_length=20),
    due_within_days: int | None = Query(default=None, ge=1, le=365),
    due_soon: bool = Query(default=False),
    limit: int = Query(default=200, ge=1, le=1000),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    is_admin = _is_admin(x_user_roles)
    type_filter = _clean_optional(document_type_id)
    state_filter = _clean_optional(state_code)
    assignee_filter = _clean_optional(assignee_user_id)
    assigned_filter = _clean_optional(assigned_user_id)
    modified_after = _modified_after_filter(date)

    query = (
        db.query(Document)
        .filter(Document.archived_at.is_(None))
    )
    search = q.strip() if q else ""
    if search:
        pattern = f"%{_escape_like_query(search)}%"
        query = query.filter(
            or_(
                Document.title.ilike(pattern, escape="\\"),
                Document.code.ilike(pattern, escape="\\"),
            )
        )
    if type_filter:
        query = query.filter(Document.document_type_id == type_filter)
    if modified_after:
        query = query.filter(Document.updated_at >= modified_after)

    # US-034: vencimientos proximos. due_within_days acota a una ventana de
    # dias; due_soon devuelve TODOS los que tienen fecha (sin tope de dias)
    # ordenados por proximidad -> evita que un vencimiento lejano "no se
    # muestre" en el widget.
    # `limit` acota cuantos documentos se traen (y por ende el batch de workflow,
    # mime/starred y la serializacion). Evita colgar la web con miles de docs.
    if due_within_days is not None:
        limit_dt = datetime.now(timezone.utc) + timedelta(days=due_within_days)
        query = query.filter(
            Document.due_at.isnot(None),
            Document.due_at <= limit_dt,
        )
        documents = query.order_by(Document.due_at.asc()).limit(limit).all()
    elif due_soon:
        query = query.filter(Document.due_at.isnot(None))
        documents = query.order_by(Document.due_at.asc()).limit(limit).all()
    else:
        documents = query.order_by(Document.created_at.desc()).limit(limit).all()
    ids = [d.id for d in documents]
    summary_map = _fetch_batch_workflow_summaries(ids)
    documents = _filter_visible_documents(
        documents,
        summary_map,
        actor_user_id,
        state_filter=state_filter,
        assignee_filter=assignee_filter,
        assigned_filter=assigned_filter,
        is_admin=is_admin,
    )
    ids = [d.id for d in documents]

    mime_map = _current_mime_map(db, ids)
    starred = _starred_set(db, actor_user_id, ids)
    return [
        _to_document_response(
            document,
            workflow=summary_map.get(document.id),
            current_mime_type=mime_map.get(document.id),
            is_starred=document.id in starred,
        )
        for document in documents
    ]


@router.get("/favorites", response_model=list[DocumentResponse])
def list_favorite_documents(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    """Lista los documentos marcados como favoritos por el actor.

    Excluye los archivados (papelera) y los que el actor ya no puede ver
    (filtro de visibilidad estandar). Admin bypass aplica al filtro de
    visibilidad, pero el set de favoritos sigue siendo el del actor.
    """
    actor_user_id = _require_user(x_user_id)
    is_admin = _is_admin(x_user_roles)
    fav_doc_ids = [
        row[0]
        for row in db.query(DocumentFavorite.document_id)
        .filter(DocumentFavorite.user_id == actor_user_id)
        .all()
    ]
    if not fav_doc_ids:
        return []
    documents = (
        db.query(Document)
        .filter(Document.id.in_(fav_doc_ids), Document.archived_at.is_(None))
        .order_by(Document.updated_at.desc())
        .all()
    )
    ids = [d.id for d in documents]
    summary_map = _fetch_batch_workflow_summaries(ids)
    documents = _filter_visible_documents(documents, summary_map, actor_user_id, is_admin=is_admin)
    ids = [d.id for d in documents]
    mime_map = _current_mime_map(db, ids)
    return [
        _to_document_response(
            document,
            workflow=summary_map.get(document.id),
            current_mime_type=mime_map.get(document.id),
            is_starred=True,
        )
        for document in documents
    ]


@router.get("/archived", response_model=list[DocumentResponse])
def list_archived_documents(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    """Lista los documentos con estado workflow terminal.

    "Archivados" = documentos firmados o resueltos, segun el usuario:
    estado workflow en {aprobado, rechazado, archivado}. Excluye papelera
    (Document.archived_at IS NOT NULL). Filtra por visibilidad estandar.
    """
    actor_user_id = _require_user(x_user_id)
    is_admin = _is_admin(x_user_roles)
    documents = (
        db.query(Document)
        .filter(Document.archived_at.is_(None))
        .order_by(Document.updated_at.desc())
        .all()
    )
    ids = [d.id for d in documents]
    summary_map = _fetch_batch_workflow_summaries(ids)
    terminal_states = {"aprobado", "rechazado", "archivado"}
    documents = [
        document
        for document in documents
        if (summary_map.get(document.id) or {}).get("state_code") in terminal_states
    ]
    documents = _filter_visible_documents(documents, summary_map, actor_user_id, is_admin=is_admin)
    ids = [d.id for d in documents]
    mime_map = _current_mime_map(db, ids)
    starred = _starred_set(db, actor_user_id, ids)
    return [
        _to_document_response(
            document,
            workflow=summary_map.get(document.id),
            current_mime_type=mime_map.get(document.id),
            is_starred=document.id in starred,
        )
        for document in documents
    ]


@router.get("/trash", response_model=list[DocumentResponse])
def list_trashed_documents(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    base_query = db.query(Document).filter(Document.archived_at.is_not(None))
    if not _is_admin(x_user_roles):
        base_query = base_query.filter(
            (Document.owner_user_id == actor_user_id) | (Document.created_by_user_id == actor_user_id),
        )
    documents = base_query.order_by(Document.archived_at.desc()).all()
    ids = [d.id for d in documents]
    mime_map = _current_mime_map(db, ids)
    state_map = _fetch_batch_workflow_states(ids)
    starred = _starred_set(db, actor_user_id, ids)
    return [
        _to_document_response(
            document,
            workflow={"state_code": state_map.get(document.id)} if state_map.get(document.id) else None,
            current_mime_type=mime_map.get(document.id),
            is_starred=document.id in starred,
        )
        for document in documents
    ]


def _aggregate_from_summaries(document_ids: list[str]) -> dict:
    """US-027: agregados por estado y encargado para una lista de doc IDs.

    Usa batch-summaries del workflow-service, asi solo se cuentan los
    documentos que realmente existen y estan activos en document-service.
    """
    if not document_ids:
        return {"by_state": {}, "by_owner": {}}
    summaries = _fetch_batch_workflow_summaries(document_ids)
    by_state: dict[str, int] = {}
    by_owner: dict[str, int] = {}
    for summary in summaries.values():
        state = (summary or {}).get("state_code")
        if state:
            by_state[state] = by_state.get(state, 0) + 1
        assignee = (summary or {}).get("assignee_user_id")
        if assignee:
            by_owner[assignee] = by_owner.get(assignee, 0) + 1
    return {"by_state": by_state, "by_owner": by_owner}


@router.get("/metrics")
def get_document_metrics(
    scope: str | None = Query(default=None, max_length=10),
    project_id: str | None = Query(default=None, max_length=64),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    """US-027: metricas del dashboard.

    Por defecto se acotan al alcance del usuario (owner, creador, encargado
    o asignado). Si el caller es admin y pasa ?scope=all, se devuelven las
    metricas globales del workspace (todos los documentos activos). Para
    cualquier otro caller, scope=all → 403.

    Si se pasa ?project_id=, las metricas se acotan ademas a ese proyecto
    (documentos cuyos expedientes pertenecen al proyecto). Un proyecto sin
    documentos devuelve todo en cero.
    """
    actor_user_id = _require_user(x_user_id)
    is_admin = _is_admin(x_user_roles)
    want_global = (scope or "").strip().lower() == "all"
    if want_global and not is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo administradores pueden consultar metricas globales")

    now = datetime.now(timezone.utc)
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    tomorrow_start = today_start + timedelta(days=1)
    week_end = today_start + timedelta(days=7)

    metrics_query = (
        db.query(Document.id, Document.owner_user_id, Document.created_by_user_id, Document.due_at)
        .filter(Document.archived_at.is_(None))
    )
    project_id_clean = (project_id or "").strip()
    if project_id_clean:
        # Acota al proyecto: documentos cuyos expedientes pertenecen a el.
        # Sin expedientes en el proyecto -> lista vacia -> sin documentos.
        project_expedient_ids = [
            row.id
            for row in db.query(Expedient.id)
            .filter(Expedient.project_id == project_id_clean)
            .all()
        ]
        metrics_query = metrics_query.filter(Document.expedient_id.in_(project_expedient_ids))
    active_rows = metrics_query.all()
    active_ids_all = [row.id for row in active_rows]
    summaries_all = _fetch_batch_workflow_summaries(active_ids_all)

    user_doc_ids: set[str]
    if want_global:
        user_doc_ids = set(active_ids_all)
    else:
        user_doc_ids = set()
        for row in active_rows:
            if row.owner_user_id == actor_user_id or row.created_by_user_id == actor_user_id:
                user_doc_ids.add(row.id)
        for doc_id, summary in summaries_all.items():
            summary = summary or {}
            if summary.get("assignee_user_id") == actor_user_id:
                user_doc_ids.add(doc_id)
            elif actor_user_id in (summary.get("assigned_user_ids") or []):
                user_doc_ids.add(doc_id)

    total = len(user_doc_ids)

    # Vencimientos del usuario (sobre los mismos doc IDs).
    due_at_by_id = {row.id: row.due_at for row in active_rows if row.id in user_doc_ids}
    vencen_hoy = sum(
        1 for due in due_at_by_id.values()
        if due is not None and today_start <= due < tomorrow_start
    )
    vencidos = sum(
        1 for due in due_at_by_id.values()
        if due is not None and due < today_start
    )
    proximos_7 = sum(
        1 for due in due_at_by_id.values()
        if due is not None and today_start <= due < week_end
    )

    by_state: dict[str, int] = {}
    by_owner: dict[str, int] = {}
    for doc_id, summary in summaries_all.items():
        if doc_id not in user_doc_ids:
            continue
        summary = summary or {}
        state = summary.get("state_code")
        if state:
            by_state[state] = by_state.get(state, 0) + 1
        assignee = summary.get("assignee_user_id")
        if assignee:
            by_owner[assignee] = by_owner.get(assignee, 0) + 1

    return {
        "total": total,
        "by_state": by_state,
        "by_owner": by_owner,
        "pendientes_revision": int(by_state.get("en_revision", 0)),
        "pendientes_firma": int(by_state.get("pendiente_firma", 0)),
        "borradores": int(by_state.get("borrador", 0)),
        "aprobados": int(by_state.get("aprobado", 0)),
        "rechazados": int(by_state.get("rechazado", 0)),
        "observados": int(by_state.get("observado", 0)),
        "vencen_hoy": vencen_hoy,
        "vencidos": vencidos,
        "proximos_7_dias": proximos_7,
    }


@router.get("/{document_id}", response_model=DocumentDetailResponse)
def get_document_detail(
    document_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    document = _document_for_actor(db, document_id.strip(), actor_user_id, x_user_roles=x_user_roles)
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
    # No se usa collaboration["history"]: es un re-fetch lossy del historial
    # de workflow (pierde `note`/comentario) y duplicaria eventos. El
    # historial de workflow se toma directo, que es la fuente autoritativa.
    workflow_history = _fetch_workflow_history(document.id)
    permission_history = _fetch_permission_history(document.id)
    # US-022: emite un evento sintetico 'comment_resolved' por cada comentario
    # resuelto, leyendo del propio timeline para no agregar otra llamada HTTP.
    comment_resolution_events: list[DocumentDetailTimelineItemResponse] = []
    for item in comments:
        if not isinstance(item, dict):
            continue
        resolved_at = item.get("resolved_at")
        if not resolved_at:
            continue
        comment_resolution_events.append(
            DocumentDetailTimelineItemResponse(
                id=f"{item.get('id')}-resolved",
                actor_user_id=item.get("resolved_by_user_id"),
                action="comment_resolved",
                body=item.get("id"),
                created_at=resolved_at,
            )
        )

    history_items = [
        *[DocumentDetailTimelineItemResponse(**item) for item in workflow_history if isinstance(item, dict)],
        *[DocumentDetailTimelineItemResponse(**item) for item in permission_history if isinstance(item, dict)],
        *_metadata_history(document),
        *_version_history(versions),
        *comment_resolution_events,
    ]
    history_items.sort(key=lambda item: item.created_at, reverse=True)

    can_operate = document.archived_at is None and _can_upload_version(document, actor_user_id)
    # US-005: tomamos en cuenta los grants explicitos para los can_* del frontend.
    grants = _fetch_user_grants(document.id, actor_user_id) if not can_operate else set()
    is_starred = bool(_starred_set(db, actor_user_id, [document.id]))
    return DocumentDetailResponse(
        document=_to_document_response(document, workflow_raw, is_starred=is_starred),
        workflow=workflow,
        files=files,
        comments=[DocumentDetailTimelineItemResponse(**item) for item in comments if isinstance(item, dict)],
        history=history_items,
        permissions=DocumentDetailPermissionsResponse(
            can_edit_metadata=can_operate or "edit_metadata" in grants,
            can_upload_version=can_operate or "upload_version" in grants,
            can_move_to_trash=can_operate,
            can_download_file=document.archived_at is None and (can_operate or "download" in grants or "view" in grants or _can_view_document(document, actor_user_id, workflow_raw if isinstance(workflow_raw, dict) else None)),
            can_comment=document.archived_at is None and (can_operate or "comment" in grants or _can_view_document(document, actor_user_id, workflow_raw if isinstance(workflow_raw, dict) else None)),
            can_assign_assignee=can_operate,
            can_manage_permissions=can_operate or "manage_permissions" in grants,
            # US-016/US-017: aprobar y rechazar son dos caras del mismo permiso
            # de aprobacion. Owner/admin pasan via can_operate; otros usuarios
            # necesitan grant explicito "approve".
            can_approve=document.archived_at is None and (can_operate or "approve" in grants),
        ),
    )


def _normalize_dt(value: datetime | None) -> datetime | None:
    """Normaliza a UTC con zona para comparar fechas de forma estable."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _parse_due_date(value: str | None) -> datetime | None:
    """ISO "YYYY-MM-DD" o datetime. "" / null => None (limpia). Invalido => 422."""
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    try:
        parsed = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Fecha de vencimiento invalida (use formato ISO, p. ej. 2026-06-30)",
        ) from exc
    return _normalize_dt(parsed)


def _notify_due_date_change(document_id: str, actor_user_id: str, due_at: datetime | None) -> None:
    """Best-effort: avisa a los asignados activos del cambio de fecha de vencimiento."""
    if due_at is not None:
        fecha = due_at.date().isoformat()
        title = "Fecha de vencimiento actualizada"
        body_text = f"El documento vence el {fecha}."
    else:
        title = "Fecha de vencimiento eliminada"
        body_text = "El documento ya no tiene fecha de vencimiento."
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.get(
                f"{settings.WORKFLOW_SERVICE_URL}/internal/workflow/documents/{document_id}/assignments",
            )
            if response.status_code >= 400:
                return
            recipients: list[str] = []
            for item in response.json():
                uid = str(item.get("user_id", "")).strip()
                if uid and uid != actor_user_id and uid not in recipients:
                    recipients.append(uid)
            for recipient in recipients:
                client.post(
                    f"{settings.COLLABORATION_SERVICE_URL}/internal/collaboration/notifications",
                    json={
                        "recipient_user_id": recipient,
                        "actor_user_id": actor_user_id,
                        "document_id": document_id,
                        "source_id": None,
                        "type": "fecha_vencimiento",
                        "title": title,
                        "body": body_text,
                    },
                )
    except httpx.HTTPError:
        pass


@router.patch("/{document_id}/metadata", response_model=DocumentResponse)
def update_document_metadata(
    document_id: str,
    body: UpdateDocumentMetadataRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    document = _document_for_actor(db, document_id.strip(), actor_user_id, permission="edit_metadata", x_user_roles=x_user_roles)
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
    change_details = {
        field: (getattr(document, field), updates[field])
        for field in changed_fields
    }

    due_provided = "due_date" in body.model_fields_set
    new_due = _parse_due_date(body.due_date) if due_provided else None
    due_changed = due_provided and _normalize_dt(document.due_at) != _normalize_dt(new_due)
    current_mime_type = _current_mime_map(db, [document.id]).get(document.id)

    if not changed_fields and not due_changed:
        return _to_document_response(document, current_mime_type=current_mime_type)

    # Si el expedient_id cambia, el folder_id queda huérfano (apunta a una
    # carpeta del expediente anterior). Lo limpiamos para evitar inconsistencia.
    expedient_changing = "expedient_id" in changed_fields
    for field, value in updates.items():
        setattr(document, field, value)
    if expedient_changing and document.folder_id is not None:
        document.folder_id = None
    if due_changed:
        change_details["due_date"] = (document.due_at, new_due)
        document.due_at = new_due
        changed_fields.append("due_date")
    document.updated_at = datetime.now(timezone.utc)
    _record_metadata_activity(document, actor_user_id, changed_fields)

    db.commit()
    db.refresh(document)

    if due_changed:
        _notify_due_date_change(document.id, actor_user_id, document.due_at)
    _notify_metadata_change(document.id, document.title, actor_user_id, change_details)

    return _to_document_response(document, current_mime_type=current_mime_type)


@router.patch("/{document_id}/trash", response_model=DocumentResponse)
def move_document_to_trash(
    document_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    document = _document_for_actor(db, document_id.strip(), actor_user_id, permission="move_to_trash", x_user_roles=x_user_roles)
    if document.archived_at is None:
        document.archived_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(document)
    current_mime_type = _current_mime_map(db, [document.id]).get(document.id)
    return _to_document_response(document, current_mime_type=current_mime_type)


@router.patch("/{document_id}/restore", response_model=DocumentResponse)
def restore_document_from_trash(
    document_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    document = _document_for_actor(db, document_id.strip(), actor_user_id, permission="restore", x_user_roles=x_user_roles)
    if document.archived_at is not None:
        document.archived_at = None
        db.commit()
        db.refresh(document)
    current_mime_type = _current_mime_map(db, [document.id]).get(document.id)
    return _to_document_response(document, current_mime_type=current_mime_type)


@router.delete("/{document_id}", response_model=DocumentDeleteResponse)
def delete_trashed_document(
    document_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    document = _document_for_actor(db, document_id.strip(), actor_user_id, permission="delete", x_user_roles=x_user_roles)
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
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
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
    if not _can_upload_version(document, actor_user_id) and not _is_admin(x_user_roles):
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


@internal_router.get("/{document_id}/name")
def get_document_name(document_id: str, db: Session = Depends(get_db)):
    document = db.query(Document).filter(Document.id == document_id.strip()).first()
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado")
    return {"document_id": document.id, "name": document.title}


@internal_router.get("/{document_id}/access")
def check_document_access(
    document_id: str,
    permission: str = "view",
    version_id: str | None = None,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    permission_code = permission.strip().lower()
    document = _document_exists_for_actor(
        db,
        document_id.strip(),
        actor_user_id,
        permission=permission_code,
        x_user_roles=x_user_roles,
    )
    if version_id:
        version = (
            db.query(DocumentVersion)
            .filter(
                DocumentVersion.id == version_id.strip(),
                DocumentVersion.document_id == document.id,
            )
            .first()
        )
        if not version:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version no pertenece al documento")
    return {"document_id": document.id, "permission": permission_code, "version_id": version_id, "can_access": True}


@router.get("/{document_id}/versions", response_model=list[DocumentVersionResponse])
def list_document_versions(
    document_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    _document_for_actor(db, document_id.strip(), actor_user_id, x_user_roles=x_user_roles)
    versions = (
        db.query(DocumentVersion)
        .filter(DocumentVersion.document_id == document_id.strip())
        .order_by(DocumentVersion.version_number.desc())
        .all()
    )
    return [_to_response(version) for version in versions]
