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


class FileListItemResponse(FileMetadataResponse):
    upload_id: str
    upload_status: str
    document_id: str | None = None
    document_version_id: str | None = None


class CreateDocumentFromFileRequest(BaseModel):
    title: str | None = None
    description: str | None = None


class FileBulkActionRequest(BaseModel):
    file_ids: list[str]


class FileBulkDeleteResponse(BaseModel):
    deleted_count: int


class DocumentFromFileResponse(BaseModel):
    document_id: str
    document_title: str
    document_version_id: str
    file: FileMetadataResponse
