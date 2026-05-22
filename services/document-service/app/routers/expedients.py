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
from app.models import Document, Expedient
from app.routers.versions import (
    _can_view_document,
    _current_mime_map,
    _fetch_batch_workflow_summaries,
    _is_admin,
    _to_document_response,
)
from app.schemas import (
    CreateExpedientRequest,
    ExpedientDetailResponse,
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
    db: Session = Depends(get_db),
):
    _require_user(x_user_id)
    rows = db.query(Expedient).order_by(Expedient.created_at.desc()).all()
    return [_to_response(row) for row in rows]


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

    base = _to_response(expedient)
    return ExpedientDetailResponse(
        **base.model_dump(),
        documents=[
            _to_document_response(
                document,
                workflow=summary_map.get(document.id),
                current_mime_type=mime_map.get(document.id),
            )
            for document in visible
        ],
    )
