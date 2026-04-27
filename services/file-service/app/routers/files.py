import hashlib
import re
import uuid
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, status
from minio import Minio
from minio.error import S3Error
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import FileUpload, StoredFile
from app.schemas import FileMetadataResponse, FileUploadResponse

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


@router.get("/{file_id}", response_model=FileMetadataResponse)
def get_file_metadata(file_id: str, db: Session = Depends(get_db)):
    stored_file = db.query(StoredFile).filter(StoredFile.id == file_id).first()
    if not stored_file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado")
    return _to_file_response(stored_file)
