import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Response, UploadFile, status
from minio import Minio, MinioAdmin
from minio.credentials import StaticProvider
from minio.error import S3Error
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import FileUpload, StoredFile
from app.schemas import (
    CreateDocumentFromFileRequest,
    DocumentFromFileResponse,
    FileBulkActionRequest,
    FileBulkDeleteResponse,
    FileListItemResponse,
    FileMetadataResponse,
    FileUploadResponse,
    StorageSummaryResponse,
)

router = APIRouter(prefix="/files", tags=["files"])

ALLOWED_MIME_TYPES = {"application/pdf", "image/png", "image/jpeg"}


def utcnow():
    return datetime.now(timezone.utc)


def _client() -> Minio:
    return Minio(
        settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_SECURE,
    )


def _safe_filename(filename: str | None) -> str:
    name = Path(filename or "archivo").name
    return re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-") or "archivo"


def _to_file_response(stored_file: StoredFile) -> FileMetadataResponse:
    return FileMetadataResponse(
        id=stored_file.id,
        original_filename=stored_file.original_filename,
        mime_type=stored_file.mime_type,
        size_bytes=stored_file.size_bytes,
        checksum=stored_file.checksum,
        uploaded_at=stored_file.uploaded_at.isoformat(),
    )


def _to_file_list_response(stored_file: StoredFile, upload: FileUpload) -> FileListItemResponse:
    base = _to_file_response(stored_file)
    return FileListItemResponse(
        **base.model_dump(),
        upload_id=upload.id,
        upload_status=upload.upload_status,
        document_id=upload.document_id,
        document_version_id=upload.document_version_id,
    )


def _title_from_filename(filename: str) -> str:
    return Path(filename).stem.replace("-", " ").replace("_", " ").strip() or filename


async def _register_document_version(
    *,
    document_id: str,
    file_id: str,
    uploaded_by_user_id: str,
    checksum: str,
    version_comment: str | None,
) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{settings.DOCUMENT_SERVICE_URL}/documents/{document_id}/versions",
            json={
                "file_id": file_id,
                "uploaded_by_user_id": uploaded_by_user_id,
                "checksum": checksum,
                "version_comment": version_comment,
            },
        )
    response.raise_for_status()
    return response.json()


async def _create_document_from_file(
    *,
    file_id: str,
    title: str,
    description: str | None,
    created_by_user_id: str,
    checksum: str | None,
) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{settings.DOCUMENT_SERVICE_URL}/documents/from-file",
            json={
                "file_id": file_id,
                "title": title,
                "description": description,
                "created_by_user_id": created_by_user_id,
                "checksum": checksum,
            },
        )
    response.raise_for_status()
    return response.json()


def _find_upload(db: Session, file_id: str, *, status_filter: str | None = None) -> tuple[StoredFile, FileUpload]:
    query = (
        db.query(StoredFile, FileUpload)
        .join(FileUpload, FileUpload.stored_file_id == StoredFile.id)
        .filter(StoredFile.id == file_id)
    )
    if status_filter:
        query = query.filter(FileUpload.upload_status == status_filter)
    result = query.first()
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado")
    return result


def _trashed_rows_for_user(
    db: Session,
    user_id: str,
    file_ids: list[str] | None = None,
) -> list[tuple[StoredFile, FileUpload]]:
    query = (
        db.query(StoredFile, FileUpload)
        .join(FileUpload, FileUpload.stored_file_id == StoredFile.id)
        .filter(
            FileUpload.uploader_user_id == user_id,
            FileUpload.upload_status == "trashed",
        )
    )
    if file_ids is not None:
        query = query.filter(StoredFile.id.in_(file_ids))
    return query.order_by(StoredFile.uploaded_at.desc()).all()


def _restore_rows(rows: list[tuple[StoredFile, FileUpload]], db: Session) -> list[FileListItemResponse]:
    now = utcnow()
    restored: list[FileListItemResponse] = []
    for stored_file, upload in rows:
        upload.upload_status = "completed"
        upload.completed_at = now
        restored.append(_to_file_list_response(stored_file, upload))
    db.commit()
    return restored


def _delete_rows_permanently(rows: list[tuple[StoredFile, FileUpload]], db: Session) -> int:
    minio_client = _client()
    deleted_count = 0
    for stored_file, upload in rows:
        try:
            minio_client.remove_object(settings.MINIO_BUCKET, stored_file.storage_path)
        except S3Error as exc:
            if exc.code != "NoSuchKey":
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"No se pudo eliminar desde MinIO: {exc.code}") from exc
        db.delete(upload)
        db.delete(stored_file)
        deleted_count += 1
    db.commit()
    return deleted_count


@router.get("/unassigned", response_model=list[FileListItemResponse])
def list_unassigned_files(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    rows = (
        db.query(StoredFile, FileUpload)
        .join(FileUpload, FileUpload.stored_file_id == StoredFile.id)
        .filter(
            FileUpload.uploader_user_id == x_user_id,
            FileUpload.document_id.is_(None),
            FileUpload.upload_status == "completed",
        )
        .order_by(StoredFile.uploaded_at.desc())
        .all()
    )
    return [_to_file_list_response(stored_file, upload) for stored_file, upload in rows]


@router.get("/trash", response_model=list[FileListItemResponse])
def list_trashed_files(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    rows = (
        db.query(StoredFile, FileUpload)
        .join(FileUpload, FileUpload.stored_file_id == StoredFile.id)
        .filter(
            FileUpload.uploader_user_id == x_user_id,
            FileUpload.upload_status == "trashed",
        )
        .order_by(StoredFile.uploaded_at.desc())
        .all()
    )
    return [_to_file_list_response(stored_file, upload) for stored_file, upload in rows]


@router.patch("/trash/restore", response_model=list[FileListItemResponse])
def restore_selected_trashed_files(
    body: FileBulkActionRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")
    if not body.file_ids:
        return []

    rows = _trashed_rows_for_user(db, x_user_id, body.file_ids)
    return _restore_rows(rows, db)


@router.patch("/trash/restore-all", response_model=list[FileListItemResponse])
def restore_all_trashed_files(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    rows = _trashed_rows_for_user(db, x_user_id)
    return _restore_rows(rows, db)


@router.post("/trash/delete", response_model=FileBulkDeleteResponse)
def delete_selected_trashed_files(
    body: FileBulkActionRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")
    if not body.file_ids:
        return FileBulkDeleteResponse(deleted_count=0)

    rows = _trashed_rows_for_user(db, x_user_id, body.file_ids)
    return FileBulkDeleteResponse(deleted_count=_delete_rows_permanently(rows, db))


@router.post("/trash/delete-all", response_model=FileBulkDeleteResponse)
def delete_all_trashed_files(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    rows = _trashed_rows_for_user(db, x_user_id)
    return FileBulkDeleteResponse(deleted_count=_delete_rows_permanently(rows, db))


@router.post("/upload", response_model=FileUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    document_id: str | None = Form(default=None),
    version_comment: str | None = Form(default=None),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    mime_type = file.content_type or "application/octet-stream"
    if mime_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Tipo MIME no permitido")

    content = await file.read()
    size_bytes = len(content)
    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    if size_bytes <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El archivo esta vacio")
    if size_bytes > max_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Archivo excede tamano maximo")

    file_id = str(uuid.uuid4())
    original_filename = _safe_filename(file.filename)
    stored_filename = f"{file_id}-{original_filename}"
    storage_path = f"{file_id}/{stored_filename}"
    checksum = hashlib.sha256(content).hexdigest()

    if settings.STORAGE_BACKEND != "minio":
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Backend de almacenamiento no soportado")

    minio_client = _client()
    try:
        if not minio_client.bucket_exists(settings.MINIO_BUCKET):
            minio_client.make_bucket(settings.MINIO_BUCKET)
        minio_client.put_object(
            settings.MINIO_BUCKET,
            storage_path,
            BytesIO(content),
            length=size_bytes,
            content_type=mime_type,
        )
    except S3Error as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"No se pudo almacenar en MinIO: {exc.code}") from exc

    stored_file = StoredFile(
        id=file_id,
        original_filename=original_filename,
        stored_filename=stored_filename,
        mime_type=mime_type,
        size_bytes=size_bytes,
        storage_backend="minio",
        storage_path=storage_path,
        checksum=checksum,
        uploader_user_id=x_user_id,
    )
    upload = FileUpload(
        stored_file_id=file_id,
        document_id=document_id,
        uploader_user_id=x_user_id,
        upload_status="pending",
    )
    db.add(stored_file)
    db.add(upload)
    db.commit()
    db.refresh(stored_file)
    db.refresh(upload)

    version_number = None
    if document_id:
        try:
            version = await _register_document_version(
                document_id=document_id,
                file_id=file_id,
                uploaded_by_user_id=x_user_id,
                checksum=checksum,
                version_comment=version_comment,
            )
            upload.document_version_id = version["id"]
            version_number = version["version_number"]
        except httpx.HTTPError as exc:
            upload.upload_status = "failed"
            upload.error_message = str(exc)
            db.commit()
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="No se pudo registrar version documental") from exc

    upload.upload_status = "completed"
    upload.completed_at = utcnow()
    db.commit()
    db.refresh(upload)

    return FileUploadResponse(
        file=_to_file_response(stored_file),
        upload_id=upload.id,
        document_id=document_id,
        document_version_id=upload.document_version_id,
        version_number=version_number,
    )


@router.post("/{file_id}/document", response_model=DocumentFromFileResponse, status_code=status.HTTP_201_CREATED)
async def create_document_from_file(
    file_id: str,
    body: CreateDocumentFromFileRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    stored_file, upload = _find_upload(db, file_id, status_filter="completed")
    if upload.uploader_user_id != x_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes usar este archivo")
    if upload.document_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Archivo ya asociado a un documento")

    title = body.title.strip() if body.title else _title_from_filename(stored_file.original_filename)
    try:
        created = await _create_document_from_file(
            file_id=stored_file.id,
            title=title,
            description=body.description,
            created_by_user_id=x_user_id,
            checksum=stored_file.checksum,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="No se pudo crear documento desde archivo") from exc

    upload.document_id = created["document"]["id"]
    upload.document_version_id = created["version"]["id"]
    upload.upload_status = "assigned"
    db.commit()
    db.refresh(upload)

    return DocumentFromFileResponse(
        document_id=created["document"]["id"],
        document_title=created["document"]["title"],
        document_version_id=created["version"]["id"],
        file=_to_file_response(stored_file),
    )


@router.patch("/{file_id}/trash", response_model=FileListItemResponse)
def move_file_to_trash(
    file_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    stored_file, upload = _find_upload(db, file_id)
    if upload.uploader_user_id != x_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes modificar este archivo")
    if upload.document_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No se puede enviar a papelera un archivo ya asignado")
    upload.upload_status = "trashed"
    upload.completed_at = utcnow()
    db.commit()
    db.refresh(upload)

    return _to_file_list_response(stored_file, upload)


@router.patch("/{file_id}/restore", response_model=FileListItemResponse)
def restore_file_from_trash(
    file_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    stored_file, upload = _find_upload(db, file_id, status_filter="trashed")
    if upload.uploader_user_id != x_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes restaurar este archivo")

    upload.upload_status = "completed"
    upload.completed_at = utcnow()
    db.commit()
    db.refresh(upload)
    return _to_file_list_response(stored_file, upload)


@router.delete("/{file_id}", response_model=FileBulkDeleteResponse)
def delete_file_permanently(
    file_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    stored_file, upload = _find_upload(db, file_id, status_filter="trashed")
    if upload.uploader_user_id != x_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes eliminar este archivo")

    return FileBulkDeleteResponse(deleted_count=_delete_rows_permanently([(stored_file, upload)], db))


@router.get("/{file_id}/content")
def get_file_content(
    file_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    stored_file, upload = _find_upload(db, file_id)
    if upload.uploader_user_id != x_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes ver este archivo")

    minio_client = _client()
    obj = None
    try:
        obj = minio_client.get_object(settings.MINIO_BUCKET, stored_file.storage_path)
        content = obj.read()
    except S3Error as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"No se pudo leer desde MinIO: {exc.code}") from exc
    finally:
        if obj:
            obj.close()
            obj.release_conn()

    return Response(
        content=content,
        media_type=stored_file.mime_type,
        headers={
            "Cache-Control": "private, max-age=60",
            "Content-Disposition": f'inline; filename="{stored_file.original_filename}"',
        },
    )


@router.get("/{file_id}", response_model=FileMetadataResponse)
def get_file_metadata(file_id: str, db: Session = Depends(get_db)):
    stored_file = db.query(StoredFile).filter(StoredFile.id == file_id).first()
    if not stored_file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado")
    return _to_file_response(stored_file)


@router.get("/storage/summary", response_model=StorageSummaryResponse)
def get_storage_summary(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    used_bytes: int = (
        db.query(func.sum(StoredFile.size_bytes))
        .join(FileUpload, FileUpload.stored_file_id == StoredFile.id)
        .filter(
            FileUpload.uploader_user_id == x_user_id,
            FileUpload.upload_status != "deleted",
        )
        .scalar()
        or 0
    )

    try:
        admin = MinioAdmin(
            settings.MINIO_ENDPOINT,
            credentials=StaticProvider(settings.MINIO_ACCESS_KEY, settings.MINIO_SECRET_KEY),
            secure=settings.MINIO_SECURE,
        )
        info = json.loads(admin.info())
        servers = info.get("servers") or []
        total_bytes = sum(
            d.get("totalSpace", 0)
            for server in servers
            for d in (server.get("drives") or [])
        )
    except Exception:
        total_bytes = 0

    return StorageSummaryResponse(used_bytes=used_bytes, total_bytes=total_bytes)
