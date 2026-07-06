import hashlib
import re
import uuid
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Response, UploadFile, status
from minio import Minio
from minio.error import S3Error
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import FileUpload, StoredFile
from app.schemas import (
    AssignFileToDocumentRequest,
    CreateDocumentFromFileRequest,
    DocumentFromFileResponse,
    FileBatchMetadataItem,
    FileBatchMetadataRequest,
    FileBulkActionRequest,
    FileBulkDeleteResponse,
    FileListItemResponse,
    FileMetadataResponse,
    FileUploadResponse,
    StorageSummaryResponse,
)

router = APIRouter(prefix="/files", tags=["files"])
internal_router = APIRouter(prefix="/internal/files", tags=["internal-files"])

ALLOWED_MIME_TYPES = {"application/pdf", "image/png", "image/jpeg", "text/plain"}
READ_CHUNK_SIZE = 1024 * 1024


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


def _detect_mime_type(content: bytes) -> str | None:
    if content.startswith(b"%PDF-"):
        return "application/pdf"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    # Los archivos de texto no tienen una firma binaria. Se aceptan solo si
    # son UTF-8 valido y no contienen bytes NUL, para evitar clasificar un
    # binario arbitrario como texto plano.
    if b"\x00" not in content:
        try:
            content.decode("utf-8")
        except UnicodeDecodeError:
            pass
        else:
            return "text/plain"
    return None


async def _read_limited_upload(file: UploadFile, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    size = 0
    while True:
        chunk = await file.read(READ_CHUNK_SIZE)
        if not chunk:
            break
        size += len(chunk)
        if size > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Archivo excede tamano maximo",
            )
        chunks.append(chunk)
    return b"".join(chunks)


async def _assert_document_access(document_id: str, user_id: str) -> None:
    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.get(
            f"{settings.DOCUMENT_SERVICE_URL}/internal/documents/{document_id}/access",
            headers={"X-User-Id": user_id},
        )
    if response.status_code in {
        status.HTTP_401_UNAUTHORIZED,
        status.HTTP_403_FORBIDDEN,
        status.HTTP_404_NOT_FOUND,
    }:
        raise HTTPException(status_code=response.status_code, detail="No puedes ver este archivo")
    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo validar acceso documental",
        )


def _assert_document_access_sync(document_id: str, user_id: str) -> None:
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.get(
                f"{settings.DOCUMENT_SERVICE_URL}/internal/documents/{document_id}/access",
                headers={"X-User-Id": user_id},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo validar acceso documental",
        ) from exc

    if response.status_code in {
        status.HTTP_401_UNAUTHORIZED,
        status.HTTP_403_FORBIDDEN,
        status.HTTP_404_NOT_FOUND,
    }:
        raise HTTPException(status_code=response.status_code, detail="No puedes ver este archivo")
    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="document-service rechazo la validacion de acceso",
        )


def _assert_file_access(upload: FileUpload, user_id: str) -> None:
    if upload.document_id:
        _assert_document_access_sync(upload.document_id, user_id)
        return
    if upload.uploader_user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes ver este archivo")


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
            headers={"X-User-Id": uploaded_by_user_id},
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
    description: str,
    document_type_id: str,
    confidentiality_level: str,
    expedient_id: str | None,
    created_by_user_id: str,
    checksum: str | None,
) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{settings.DOCUMENT_SERVICE_URL}/documents/from-file",
            headers={"X-User-Id": created_by_user_id},
            json={
                "file_id": file_id,
                "title": title,
                "description": description,
                "document_type_id": document_type_id,
                "confidentiality_level": confidentiality_level,
                "expedient_id": expedient_id,
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

    document_id = document_id.strip() if document_id else None
    if document_id:
        try:
            await _assert_document_access(document_id, x_user_id)
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="No se pudo validar acceso al documento",
            ) from exc

    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    content = await _read_limited_upload(file, max_bytes)
    size_bytes = len(content)
    if size_bytes <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El archivo esta vacio")

    detected_mime_type = _detect_mime_type(content)
    declared_mime_type = file.content_type or "application/octet-stream"
    if detected_mime_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Tipo MIME no permitido")
    if declared_mime_type in ALLOWED_MIME_TYPES and detected_mime_type and declared_mime_type != detected_mime_type:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Tipo MIME no coincide con el archivo")
    mime_type = detected_mime_type

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
    description = body.description.strip()
    document_type_id = body.document_type_id.strip()
    confidentiality_level = body.confidentiality_level.strip()
    expedient_id = body.expedient_id.strip() if body.expedient_id else None
    if not description:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Descripcion requerida")
    if not document_type_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tipo documental requerido")
    if not confidentiality_level:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Confidencialidad requerida")
    try:
        created = await _create_document_from_file(
            file_id=stored_file.id,
            title=title,
            description=description,
            document_type_id=document_type_id,
            confidentiality_level=confidentiality_level,
            expedient_id=expedient_id,
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


@router.patch("/{file_id}/document", response_model=FileListItemResponse)
async def assign_file_to_document(
    file_id: str,
    body: AssignFileToDocumentRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    document_id = body.document_id.strip()
    if not document_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Documento requerido")

    stored_file, upload = _find_upload(db, file_id, status_filter="completed")
    if upload.uploader_user_id != x_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes usar este archivo")
    if upload.document_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Archivo ya asociado a un documento")

    try:
        version = await _register_document_version(
            document_id=document_id,
            file_id=stored_file.id,
            uploaded_by_user_id=x_user_id,
            checksum=stored_file.checksum or "",
            version_comment=body.version_comment,
        )
    except httpx.HTTPStatusError as exc:
        detail = "No se pudo asociar el archivo al documento"
        try:
            response_detail = exc.response.json().get("detail")
            if isinstance(response_detail, str):
                detail = response_detail
        except ValueError:
            pass
        raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="No se pudo registrar version documental") from exc

    upload.document_id = document_id
    upload.document_version_id = version["id"]
    upload.upload_status = "assigned"
    upload.completed_at = utcnow()
    db.commit()
    db.refresh(upload)

    return _to_file_list_response(stored_file, upload)


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
    _assert_file_access(upload, x_user_id)

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
def get_file_metadata(
    file_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    stored_file, upload = _find_upload(db, file_id)
    _assert_file_access(upload, x_user_id)
    return _to_file_response(stored_file)


def _fetch_project_document_ids(project_id: str, user_id: str) -> list[str]:
    """Pide al document-service los IDs de documentos del proyecto.

    Se usa para acotar el almacenamiento por proyecto. Ante fallo de red o
    respuesta invalida, se propaga un 502 (la cuota es informativa; el
    frontend ya tolera el fallo sin bloquear la accion principal).
    """
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.get(
                f"{settings.DOCUMENT_SERVICE_URL}/internal/documents/ids-by-project",
                params={"project_id": project_id},
                headers={"X-User-Id": user_id},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo consultar el proyecto en document-service",
        ) from exc
    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="document-service rechazo la consulta del proyecto",
        )
    return list(response.json().get("document_ids", []))


@router.get("/storage/summary", response_model=StorageSummaryResponse)
def get_storage_summary(
    project_id: str | None = None,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    query = (
        db.query(func.sum(StoredFile.size_bytes))
        .join(FileUpload, FileUpload.stored_file_id == StoredFile.id)
        .filter(
            FileUpload.uploader_user_id == x_user_id,
            FileUpload.upload_status != "deleted",
        )
    )
    project_id_clean = (project_id or "").strip()
    if project_id_clean:
        # Acota el almacenamiento a los documentos del proyecto. Sin
        # documentos -> lista vacia -> suma 0.
        document_ids = _fetch_project_document_ids(project_id_clean, x_user_id)
        query = query.filter(FileUpload.document_id.in_(document_ids))
    used_bytes: int = query.scalar() or 0

    # Opción A (activa): cuota fija configurada en STORAGE_QUOTA_GB
    total_bytes = settings.STORAGE_QUOTA_GB * 1024 ** 3
    # Opción B: disco físico real — requiere "import shutil" y descomentar:
    # total_bytes = __import__("shutil").disk_usage("/").total

    return StorageSummaryResponse(used_bytes=used_bytes, total_bytes=total_bytes)


@internal_router.post("/batch-metadata", response_model=list[FileBatchMetadataItem])
def get_batch_file_metadata(
    body: FileBatchMetadataRequest,
    db: Session = Depends(get_db),
):
    if not body.file_ids:
        return []
    rows = (
        db.query(StoredFile.id, StoredFile.mime_type, StoredFile.original_filename)
        .filter(StoredFile.id.in_(body.file_ids))
        .all()
    )
    return [
        FileBatchMetadataItem(file_id=file_id, mime_type=mime, original_filename=fname)
        for file_id, mime, fname in rows
    ]
