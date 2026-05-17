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


class AssignmentCountsRequest(BaseModel):
    document_ids: list[str]


class AssignmentCountsResponse(BaseModel):
    counts: dict[str, int]


class BatchStatesRequest(BaseModel):
    document_ids: list[str]


class BatchStatesResponse(BaseModel):
    states: dict[str, str]


class BatchWorkflowSummary(BaseModel):
    state_code: str | None = None
    assignee_user_id: str | None = None
    assigned_user_ids: list[str] = Field(default_factory=list)


class BatchWorkflowSummariesResponse(BaseModel):
    summaries: dict[str, BatchWorkflowSummary]


class ChangeDocumentStateRequest(BaseModel):
    new_state_code: str
    comment: str | None = None


class ChangeDocumentStateResponse(BaseModel):
    document_id: str
    previous_state_code: str | None
    new_state_code: str
    changed_by_user_id: str
    changed_at: str


class AssignDocumentAssigneeRequest(BaseModel):
    user_id: str


class AssignDocumentAssigneeResponse(BaseModel):
    document_id: str
    previous_assignee_user_id: str | None
    assignee_user_id: str
    assigned_by_user_id: str
    assigned_at: str


class WorkflowHistoryItem(BaseModel):
    id: str
    actor_user_id: str
    action: str
    body: str | None = None
    created_at: str
