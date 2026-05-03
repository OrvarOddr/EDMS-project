from pydantic import BaseModel, ConfigDict, Field


class CreateDocumentRequest(BaseModel):
    title: str
    document_type_id: str
    description: str
    expedient_id: str | None = None
    confidentiality_level: str = "publico_interno"


class UpdateDocumentMetadataRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    document_type_id: str
    description: str
    expedient_id: str | None = None
    confidentiality_level: str = "publico_interno"


class RegisterDocumentVersionRequest(BaseModel):
    file_id: str
    uploaded_by_user_id: str
    checksum: str | None = None
    version_comment: str | None = None


class DocumentVersionResponse(BaseModel):
    id: str
    document_id: str
    version_number: int
    file_id: str
    uploaded_by_user_id: str
    checksum: str | None = None
    is_current: bool
    created_at: str


class CreateDocumentFromFileRequest(BaseModel):
    file_id: str
    title: str
    created_by_user_id: str
    checksum: str | None = None
    description: str | None = None


class DocumentActivityResponse(BaseModel):
    id: str
    actor_user_id: str
    action: str
    changed_fields: list[str]
    created_at: str


class DocumentResponse(BaseModel):
    id: str
    code: str
    title: str
    description: str | None = None
    document_type_id: str | None = None
    expedient_id: str | None = None
    confidentiality_level: str
    created_by_user_id: str
    owner_user_id: str
    created_at: str
    updated_at: str
    archived_at: str | None = None
    metadata_activity: list[DocumentActivityResponse] = Field(default_factory=list)
    workflow_state_code: str | None = None
    assignee_user_id: str | None = None


class DocumentCreatedFromFileResponse(BaseModel):
    document: DocumentResponse
    version: DocumentVersionResponse


class DocumentDeleteResponse(BaseModel):
    deleted_count: int


class TagResponse(BaseModel):
    id: str
    label: str
    color: str
    created_by_user_id: str


class CreateTagRequest(BaseModel):
    label: str
    color: str = Field(default="#6366f1")


class UpdateTagRequest(BaseModel):
    label: str
    color: str
