"""US-029 (crear) + US-030 (ver) expedientes.

Un expediente agrupa documentos relacionados. La relacion vive en
`Document.expedient_id`; aqui exponemos el CRUD del agrupador.

Permisos: cualquier usuario autenticado puede crear/listar/ver expedientes;
en el detalle filtramos la lista de documentos asociados por permiso de
lectura del actor (admin ve todos).
"""
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Document,
    DocumentFavorite,
    DocumentTag,
    DocumentVersion,
    Expedient,
    ExpedientFolder,
)
from app.routers.versions import (
    _can_view_document,
    _current_mime_map,
    _document_for_actor,
    _escape_like_query,
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
    DocumentDeleteResponse,
    ExpedientDetailResponse,
    ExpedientFolderResponse,
    ExpedientResponse,
)

router = APIRouter(prefix="/expedients", tags=["expedients"])


def _require_user(x_user_id: str | None) -> str:
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")
    return x_user_id


def _to_response(expedient: Expedient) -> ExpedientResponse:
    return ExpedientResponse(
        id=expedient.id,
        project_id=expedient.project_id,
        name=expedient.name,
        code=expedient.code,
        description=expedient.description,
        created_by_user_id=expedient.created_by_user_id,
        created_at=expedient.created_at.isoformat(),
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
        project_id=(body.project_id or "").strip() or None,
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
    project_id: str | None = None,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    """Lista de expedientes, opcionalmente filtrada por proyecto (`?project_id=`).

    La visibilidad por rol vive en `GET /projects`; aqui solo devolvemos los
    expedientes que pertenecen a un proyecto.
    """
    _require_user(x_user_id)
    query = db.query(Expedient)
    if project_id:
        query = query.filter(Expedient.project_id == project_id.strip())
    rows = query.order_by(Expedient.created_at.desc()).all()
    return [_to_response(row) for row in rows]


@router.get("/{expedient_id}", response_model=ExpedientDetailResponse)
def get_expedient(
    expedient_id: str,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    q: str | None = Query(default=None, max_length=100),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    """Detalle del expediente con documentos **paginados** (50 por defecto) y
    **buscables** por `q` (titulo o codigo).

    Evita colgar la web al abrir un expediente con miles de documentos: se trae
    una pagina (offset/limit) en vez de todos. `document_count` es el total (ya
    filtrado por `q`) y `has_more` indica si quedan mas paginas.
    """
    actor_user_id = _require_user(x_user_id)
    is_admin = _is_admin(x_user_roles)
    expedient = db.query(Expedient).filter(Expedient.id == expedient_id.strip()).first()
    if not expedient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expediente no encontrado")

    doc_filters = [Document.expedient_id == expedient.id, Document.archived_at.is_(None)]
    search = (q or "").strip()
    if search:
        pattern = f"%{_escape_like_query(search)}%"
        doc_filters.append(
            or_(
                Document.title.ilike(pattern, escape="\\"),
                Document.code.ilike(pattern, escape="\\"),
            )
        )

    document_count = db.query(func.count(Document.id)).filter(*doc_filters).scalar() or 0

    documents = (
        db.query(Document)
        .filter(*doc_filters)
        .order_by(Document.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    has_more = offset + limit < document_count
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
        document_count=document_count,
        has_more=has_more,
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


@router.delete("/{expedient_id}", response_model=DocumentDeleteResponse)
def delete_expedient(
    expedient_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    """Elimina el expediente y TODO su contenido: documentos (con sus versiones,
    favoritos y etiquetas) y carpetas. Irreversible.

    Solo el creador del expediente o un admin pueden eliminarlo.
    """
    actor_user_id = _require_user(x_user_id)
    expedient = db.query(Expedient).filter(Expedient.id == expedient_id.strip()).first()
    if not expedient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expediente no encontrado")
    if not _is_admin(x_user_roles) and expedient.created_by_user_id != actor_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el creador del expediente o un administrador puede eliminarlo",
        )

    document_ids = [
        doc_id for (doc_id,) in db.query(Document.id).filter(Document.expedient_id == expedient.id).all()
    ]
    if document_ids:
        db.query(DocumentVersion).filter(DocumentVersion.document_id.in_(document_ids)).delete(synchronize_session=False)
        db.query(DocumentFavorite).filter(DocumentFavorite.document_id.in_(document_ids)).delete(synchronize_session=False)
        db.query(DocumentTag).filter(DocumentTag.document_id.in_(document_ids)).delete(synchronize_session=False)
        db.query(Document).filter(Document.id.in_(document_ids)).delete(synchronize_session=False)
    db.query(ExpedientFolder).filter(ExpedientFolder.expedient_id == expedient.id).delete(synchronize_session=False)
    db.delete(expedient)
    db.commit()
    return DocumentDeleteResponse(deleted_count=len(document_ids))


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
