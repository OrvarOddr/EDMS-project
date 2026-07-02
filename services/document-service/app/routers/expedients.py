"""US-029 (crear) + US-030 (ver) expedientes.

Un expediente agrupa documentos relacionados. La relacion vive en
`Document.expedient_id`; aqui exponemos el CRUD del agrupador.

Permisos: cualquier usuario autenticado puede crear/listar/ver expedientes;
en el detalle filtramos la lista de documentos asociados por permiso de
lectura del actor (admin ve todos).
"""
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Document, Expedient, ExpedientFolder
from app.routers.versions import (
    _can_view_document,
    _current_mime_map,
    _document_for_actor,
    _fetch_batch_workflow_summaries,
    _is_admin,
    _record_metadata_activity,
    _starred_set,
    _to_document_response,
)
from app.schemas import (
    AttachDocumentsSkippedItem,
    AttachDocumentsToExpedientRequest,
    AttachDocumentsToExpedientResponse,
    CreateExpedientRequest,
    ExpedientDetailResponse,
    ExpedientFolderResponse,
    ExpedientResponse,
)

router = APIRouter(prefix="/expedients", tags=["expedients"])


def _require_user(x_user_id: str | None) -> str:
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")
    return x_user_id


def _to_response(expedient: Expedient, document_count: int | None = None) -> ExpedientResponse:
    return ExpedientResponse(
        id=expedient.id,
        name=expedient.name,
        code=expedient.code,
        description=expedient.description,
        created_by_user_id=expedient.created_by_user_id,
        created_at=expedient.created_at.isoformat(),
        document_count=document_count,
    )


@router.post("", response_model=ExpedientResponse, status_code=status.HTTP_201_CREATED)
def create_expedient(
    body: CreateExpedientRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nombre requerido")
    code = (body.code or "").strip() or None
    description = (body.description or "").strip() or None

    if code:
        existing = db.query(Expedient).filter(Expedient.code == code).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Ya existe un expediente con el codigo '{code}'",
            )

    expedient = Expedient(
        name=name,
        code=code,
        description=description,
        created_by_user_id=actor_user_id,
    )
    db.add(expedient)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Codigo de expediente duplicado",
        )
    db.refresh(expedient)
    return _to_response(expedient)


@router.get("", response_model=list[ExpedientResponse])
def list_expedients(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    """Lista de proyectos (expedientes) con visibilidad por rol.

    - admin: ve todos los expedientes.
    - resto: solo aquellos donde participa, es decir donde creó el expediente
      o puede ver >=1 de sus documentos (asignado / owner / creador del doc).
      La participación se deriva de las asignaciones de workflow via
      `_can_view_document`.

    `document_count` = documentos activos visibles para el actor por expediente.
    """
    actor_user_id = _require_user(x_user_id)
    is_admin = _is_admin(x_user_roles)
    rows = db.query(Expedient).order_by(Expedient.created_at.desc()).all()
    if not rows:
        return []

    documents = (
        db.query(Document)
        .filter(
            Document.expedient_id.in_([row.id for row in rows]),
            Document.archived_at.is_(None),
        )
        .all()
    )
    summary_map = _fetch_batch_workflow_summaries([doc.id for doc in documents])

    visible_counts: dict[str, int] = {}
    for doc in documents:
        if _can_view_document(doc, actor_user_id, summary_map.get(doc.id), is_admin=is_admin):
            visible_counts[doc.expedient_id] = visible_counts.get(doc.expedient_id, 0) + 1

    result = []
    for row in rows:
        participates = row.created_by_user_id == actor_user_id or visible_counts.get(row.id, 0) > 0
        if is_admin or participates:
            result.append(_to_response(row, document_count=visible_counts.get(row.id, 0)))
    return result


@router.get("/{expedient_id}", response_model=ExpedientDetailResponse)
def get_expedient(
    expedient_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    is_admin = _is_admin(x_user_roles)
    expedient = db.query(Expedient).filter(Expedient.id == expedient_id.strip()).first()
    if not expedient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expediente no encontrado")

    documents = (
        db.query(Document)
        .filter(Document.expedient_id == expedient.id, Document.archived_at.is_(None))
        .order_by(Document.created_at.desc())
        .all()
    )
    ids = [d.id for d in documents]
    summary_map = _fetch_batch_workflow_summaries(ids)
    visible = [
        document
        for document in documents
        if _can_view_document(document, actor_user_id, summary_map.get(document.id), is_admin=is_admin)
    ]
    visible_ids = [d.id for d in visible]
    mime_map = _current_mime_map(db, visible_ids)
    starred = _starred_set(db, actor_user_id, visible_ids)

    folders = (
        db.query(ExpedientFolder)
        .filter(ExpedientFolder.expedient_id == expedient.id)
        .order_by(ExpedientFolder.created_at.asc())
        .all()
    )

    base = _to_response(expedient)
    return ExpedientDetailResponse(
        **base.model_dump(),
        documents=[
            _to_document_response(
                document,
                workflow=summary_map.get(document.id),
                current_mime_type=mime_map.get(document.id),
                is_starred=document.id in starred,
            )
            for document in visible
        ],
        folders=[
            ExpedientFolderResponse(
                id=folder.id,
                expedient_id=folder.expedient_id,
                name=folder.name,
                created_by_user_id=folder.created_by_user_id,
                created_at=folder.created_at.isoformat(),
            )
            for folder in folders
        ],
    )


@router.post(
    "/{expedient_id}/documents",
    response_model=AttachDocumentsToExpedientResponse,
)
def attach_documents_to_expedient(
    expedient_id: str,
    body: AttachDocumentsToExpedientRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    """Asocia varios documentos al expediente en una sola llamada.

    Requiere permiso `edit_metadata` por documento (admin bypass via roles).
    Documentos archivados o que el actor no pueda editar quedan en `skipped`
    para que el frontend pueda comunicar lo que no se pudo enlazar.
    """
    actor_user_id = _require_user(x_user_id)
    expedient = db.query(Expedient).filter(Expedient.id == expedient_id.strip()).first()
    if not expedient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expediente no encontrado")

    seen: set[str] = set()
    document_ids: list[str] = []
    for raw in body.document_ids:
        clean = (raw or "").strip()
        if not clean or clean in seen:
            continue
        seen.add(clean)
        document_ids.append(clean)

    attached: list[str] = []
    skipped: list[AttachDocumentsSkippedItem] = []
    for document_id in document_ids:
        try:
            document = _document_for_actor(
                db,
                document_id,
                actor_user_id,
                permission="edit_metadata",
                x_user_roles=x_user_roles,
            )
        except HTTPException as exc:
            reason = exc.detail if isinstance(exc.detail, str) else "No autorizado"
            skipped.append(AttachDocumentsSkippedItem(document_id=document_id, reason=reason))
            continue
        if document.archived_at is not None:
            skipped.append(AttachDocumentsSkippedItem(document_id=document_id, reason="Documento en papelera"))
            continue
        if document.expedient_id == expedient.id:
            # Ya esta asociado: lo reportamos como attached (idempotente).
            attached.append(document.id)
            continue
        document.expedient_id = expedient.id
        # Si venia de otro expediente, el folder_id apuntaba a una carpeta
        # ajena. Reset a la raiz del nuevo expediente.
        document.folder_id = None
        _record_metadata_activity(document, actor_user_id, ["expedient_id"])
        attached.append(document.id)
    db.commit()
    return AttachDocumentsToExpedientResponse(attached=attached, skipped=skipped)
