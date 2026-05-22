from pydantic import BaseModel, ConfigDict, Field


class CreateDocumentRequest(BaseModel):
    title: str
    document_type_id: str
    description: str
    expedient_id: str | None = None
    confidentiality_level: str = "publico_interno"
    assignee_user_id: str | None = None
    due_date: str | None = None


class UpdateDocumentMetadataRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    document_type_id: str
    description: str
    expedient_id: str | None = None
    confidentiality_level: str = "publico_interno"
    # Fecha de vencimiento opcional (ISO "YYYY-MM-DD" o datetime).
    # "" o null limpian la fecha. Ausente => no se toca.
    due_date: str | None = None


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
    version_comment: str | None = None
    checksum: str | None = None
    is_current: bool
    created_at: str


class CreateDocumentFromFileRequest(BaseModel):
    file_id: str
    title: str
    created_by_user_id: str
    document_type_id: str
    confidentiality_level: str = "publico_interno"
    expedient_id: str | None = None
    checksum: str | None = None
    description: str


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
    due_date: str | None = None
    metadata_activity: list[DocumentActivityResponse] = Field(default_factory=list)
    workflow_state_code: str | None = None
    assignee_user_id: str | None = None
    assigned_user_ids: list[str] = Field(default_factory=list)
    current_file_mime_type: str | None = None


class DocumentCreatedFromFileResponse(BaseModel):
    document: DocumentResponse
    version: DocumentVersionResponse


class DocumentDeleteResponse(BaseModel):
    deleted_count: int


class DocumentDetailWorkflowAssignmentResponse(BaseModel):
    id: str
    user_id: str
    role_code: str
    assigned_by_user_id: str
    assigned_at: str


class DocumentDetailWorkflowResponse(BaseModel):
    state_code: str | None = None
    assignee_user_id: str | None = None
    assignment_role_code: str | None = None
    assignments: list[DocumentDetailWorkflowAssignmentResponse] = Field(default_factory=list)


class DocumentDetailFileResponse(DocumentVersionResponse):
    original_filename: str | None = None
    mime_type: str | None = None
    size_bytes: int | None = None
    uploaded_at: str | None = None


class DocumentDetailTimelineItemResponse(BaseModel):
    id: str
    actor_user_id: str | None = None
    action: str
    body: str | None = None
    note: str | None = None
    created_at: str
    resolved_at: str | None = None
    resolved_by_user_id: str | None = None


class DocumentDetailPermissionsResponse(BaseModel):
    can_edit_metadata: bool
    can_upload_version: bool
    can_move_to_trash: bool
    can_download_file: bool
    can_comment: bool
    can_assign_assignee: bool
    can_manage_permissions: bool = False


class DocumentDetailResponse(BaseModel):
    document: DocumentResponse
    workflow: DocumentDetailWorkflowResponse
    files: list[DocumentDetailFileResponse] = Field(default_factory=list)
    comments: list[DocumentDetailTimelineItemResponse] = Field(default_factory=list)
    history: list[DocumentDetailTimelineItemResponse] = Field(default_factory=list)
    permissions: DocumentDetailPermissionsResponse


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


class CreateExpedientRequest(BaseModel):
    name: str
    code: str | None = None
    description: str | None = None


class ExpedientResponse(BaseModel):
    id: str
    name: str
    code: str | None = None
    description: str | None = None
    created_by_user_id: str
    created_at: str


class ExpedientDetailResponse(ExpedientResponse):
    documents: list[DocumentResponse] = Field(default_factory=list)
