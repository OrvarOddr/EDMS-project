from pydantic import BaseModel


class BootstrapDocumentWorkflowRequest(BaseModel):
    document_id: str
    created_by_user_id: str


class BootstrapDocumentWorkflowResponse(BaseModel):
    document_id: str
    state_code: str
    assignee_user_id: str
    assignment_role_code: str
