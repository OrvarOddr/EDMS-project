"""Carpetas dentro de expedientes (un solo nivel).

Permite agrupar documentos del expediente en sub-secciones tipo finder.
Endpoints:
- POST   /expedients/{expedient_id}/folders        crear carpeta
- PATCH  /expedients/{expedient_id}/folders/{id}   renombrar (creador/admin)
- DELETE /expedients/{expedient_id}/folders/{id}   borrar (creador/admin);
  los documentos vuelven a la raiz del expediente.
- PATCH  /documents/{document_id}/folder           mover el doc a una
  carpeta o sacarlo a la raiz (folder_id=null). Valida edit_metadata.
"""
from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Document, Expedient, ExpedientFolder
from app.routers.versions import (
    _current_mime_map,
    _document_for_actor,
    _fetch_batch_workflow_summaries,
    _is_admin,
    _record_metadata_activity,
    _require_user,
    _starred_set,
    _to_document_response,
)
from app.schemas import (
    CreateFolderRequest,
    DocumentResponse,
    ExpedientFolderResponse,
    MoveDocumentToFolderRequest,
    UpdateFolderRequest,
)

router = APIRouter(tags=["folders"])


def _to_folder_response(folder: ExpedientFolder) -> ExpedientFolderResponse:
    return ExpedientFolderResponse(
        id=folder.id,
        expedient_id=folder.expedient_id,
        name=folder.name,
        created_by_user_id=folder.created_by_user_id,
        created_at=folder.created_at.isoformat(),
    )


def _expedient_or_404(db: Session, expedient_id: str) -> Expedient:
    expedient = db.query(Expedient).filter(Expedient.id == expedient_id.strip()).first()
    if not expedient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expediente no encontrado")
    return expedient


def _folder_or_404(db: Session, expedient_id: str, folder_id: str) -> ExpedientFolder:
    folder = (
        db.query(ExpedientFolder)
        .filter(ExpedientFolder.id == folder_id.strip(), ExpedientFolder.expedient_id == expedient_id)
        .first()
    )
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Carpeta no encontrada")
    return folder


def _assert_folder_manager(folder: ExpedientFolder, user_id: str, x_user_roles: str | None) -> None:
    if _is_admin(x_user_roles):
        return
    if folder.created_by_user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el creador de la carpeta o un administrador puede gestionarla",
        )


@router.post(
    "/expedients/{expedient_id}/folders",
    response_model=ExpedientFolderResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_folder(
    expedient_id: str,
    body: CreateFolderRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    expedient = _expedient_or_404(db, expedient_id)
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nombre requerido")
    folder = ExpedientFolder(
        expedient_id=expedient.id,
        name=name,
        created_by_user_id=actor_user_id,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return _to_folder_response(folder)


@router.patch("/expedients/{expedient_id}/folders/{folder_id}", response_model=ExpedientFolderResponse)
def rename_folder(
    expedient_id: str,
    folder_id: str,
    body: UpdateFolderRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    _expedient_or_404(db, expedient_id)
    folder = _folder_or_404(db, expedient_id, folder_id)
    _assert_folder_manager(folder, actor_user_id, x_user_roles)
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nombre requerido")
    folder.name = name
    db.commit()
    db.refresh(folder)
    return _to_folder_response(folder)


@router.delete(
    "/expedients/{expedient_id}/folders/{folder_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_folder(
    expedient_id: str,
    folder_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    _expedient_or_404(db, expedient_id)
    folder = _folder_or_404(db, expedient_id, folder_id)
    _assert_folder_manager(folder, actor_user_id, x_user_roles)
    # Devolver los documentos de la carpeta a la raiz del expediente.
    db.query(Document).filter(Document.folder_id == folder.id).update(
        {"folder_id": None},
        synchronize_session=False,
    )
    db.delete(folder)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/documents/{document_id}/folder", response_model=DocumentResponse)
def move_document_to_folder(
    document_id: str,
    body: MoveDocumentToFolderRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    document = _document_for_actor(
        db,
        document_id.strip(),
        actor_user_id,
        permission="edit_metadata",
        x_user_roles=x_user_roles,
    )
    if document.archived_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El documento esta en papelera")
    if not document.expedient_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El documento no esta en un expediente; muevelo primero al expediente",
        )

    target_folder_id = body.folder_id.strip() if body.folder_id else None
    if target_folder_id:
        folder = _folder_or_404(db, document.expedient_id, target_folder_id)
        document.folder_id = folder.id
    else:
        document.folder_id = None
    _record_metadata_activity(document, actor_user_id, ["folder_id"])
    db.commit()
    db.refresh(document)

    # Devolvemos el doc con datos basicos; quien llama refresca el detalle si lo necesita.
    workflow = _fetch_batch_workflow_summaries([document.id]).get(document.id)
    mime = _current_mime_map(db, [document.id]).get(document.id)
    starred = bool(_starred_set(db, actor_user_id, [document.id]))
    return _to_document_response(document, workflow=workflow, current_mime_type=mime, is_starred=starred)
