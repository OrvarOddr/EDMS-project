from pydantic import BaseModel


class FileMetadataResponse(BaseModel):
    id: str
    original_filename: str
    mime_type: str
    size_bytes: int
    checksum: str | None = None
    uploaded_at: str


class FileUploadResponse(BaseModel):
    file: FileMetadataResponse
    upload_id: str
    document_id: str | None = None
    document_version_id: str | None = None
    version_number: int | None = None
