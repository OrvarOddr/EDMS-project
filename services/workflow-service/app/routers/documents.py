from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DocumentAssignment, DocumentState
from app.schemas import (
    BootstrapDocumentWorkflowRequest,
    BootstrapDocumentWorkflowResponse,
    DocumentAssignmentResponse,
    DocumentWorkflowDetailResponse,
)

router = APIRouter(prefix="/internal/workflow/documents", tags=["workflow-documents"])
public_router = APIRouter(prefix="/workflow/documents", tags=["workflow-documents"])

INITIAL_STATE = "borrador"
OWNER_ROLE = "encargado"


def _require_value(value: str, field_name: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} requerido")
    return cleaned


@router.post("/bootstrap", response_model=BootstrapDocumentWorkflowResponse, status_code=status.HTTP_201_CREATED)
def bootstrap_document_workflow(
    body: BootstrapDocumentWorkflowRequest,
    db: Session = Depends(get_db),
):
    document_id = _require_value(body.document_id, "Documento")
    creator_id = _require_value(body.created_by_user_id, "Creador")

    existing_state = (
        db.query(DocumentState)
        .filter(DocumentState.document_id == document_id, DocumentState.is_current.is_(True))
        .first()
    )
    existing_owner = (
        db.query(DocumentAssignment)
        .filter(
            DocumentAssignment.document_id == document_id,
            DocumentAssignment.role_code == OWNER_ROLE,
            DocumentAssignment.is_active.is_(True),
        )
        .first()
    )
    if existing_state and existing_owner:
        return BootstrapDocumentWorkflowResponse(
            document_id=document_id,
            state_code=existing_state.state_code,
            assignee_user_id=existing_owner.user_id,
            assignment_role_code=existing_owner.role_code,
        )

    if existing_state or existing_owner:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Workflow inicial incompleto para el documento",
        )

    state = DocumentState(
        document_id=document_id,
        state_code=INITIAL_STATE,
        changed_by_user_id=creator_id,
    )
    assignment = DocumentAssignment(
        document_id=document_id,
        user_id=creator_id,
        role_code=OWNER_ROLE,
        assigned_by_user_id=creator_id,
    )
    db.add(state)
    db.add(assignment)
    db.commit()

    return BootstrapDocumentWorkflowResponse(
        document_id=document_id,
        state_code=state.state_code,
        assignee_user_id=assignment.user_id,
        assignment_role_code=assignment.role_code,
    )


@public_router.get("/{document_id}", response_model=DocumentWorkflowDetailResponse)
def get_document_workflow_detail(
    document_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    document_id = _require_value(document_id, "Documento")
    state = (
        db.query(DocumentState)
        .filter(DocumentState.document_id == document_id, DocumentState.is_current.is_(True))
        .first()
    )
    assignments = (
        db.query(DocumentAssignment)
        .filter(DocumentAssignment.document_id == document_id, DocumentAssignment.is_active.is_(True))
        .order_by(DocumentAssignment.assigned_at.asc())
        .all()
    )
    owner = next((item for item in assignments if item.role_code == OWNER_ROLE), None)

    return DocumentWorkflowDetailResponse(
        document_id=document_id,
        state_code=state.state_code if state else None,
        assignee_user_id=owner.user_id if owner else None,
        assignment_role_code=owner.role_code if owner else None,
        assignments=[
            DocumentAssignmentResponse(
                id=assignment.id,
                user_id=assignment.user_id,
                role_code=assignment.role_code,
                assigned_by_user_id=assignment.assigned_by_user_id,
                assigned_at=assignment.assigned_at.isoformat(),
            )
            for assignment in assignments
        ],
    )
