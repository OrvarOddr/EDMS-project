from pydantic import BaseModel, Field


class BootstrapDocumentWorkflowRequest(BaseModel):
    document_id: str
    created_by_user_id: str


class BootstrapDocumentWorkflowResponse(BaseModel):
    document_id: str
    state_code: str
    assignee_user_id: str
    assignment_role_code: str


class DocumentAssignmentResponse(BaseModel):
    id: str
    user_id: str
    role_code: str
    assigned_by_user_id: str
    assigned_at: str


class DocumentWorkflowDetailResponse(BaseModel):
    document_id: str
    state_code: str | None = None
    assignee_user_id: str | None = None
    assignment_role_code: str | None = None
    assignments: list[DocumentAssignmentResponse] = Field(default_factory=list)
