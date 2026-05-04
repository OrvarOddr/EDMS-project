import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import DocumentAssignment, DocumentState
from app.schemas import (
    AssignmentCountsRequest,
    AssignmentCountsResponse,
    BatchStatesRequest,
    BatchStatesResponse,
    BootstrapDocumentWorkflowRequest,
    BootstrapDocumentWorkflowResponse,
    ChangeDocumentStateRequest,
    ChangeDocumentStateResponse,
    DocumentAssignmentResponse,
    DocumentWorkflowDetailResponse,
    WorkflowHistoryItem,
)

router = APIRouter(prefix="/internal/workflow/documents", tags=["workflow-documents"])
public_router = APIRouter(prefix="/workflow/documents", tags=["workflow-documents"])

INITIAL_STATE = "borrador"
OWNER_ROLE = "encargado"

VALID_STATES: frozenset[str] = frozenset({
    "borrador",
    "en_revision",
    "observado",
    "aprobado",
    "pendiente_firma",
    "rechazado",
    "archivado",
})

_KANBAN_STATES = {"borrador", "en_revision", "observado", "pendiente_firma", "aprobado", "rechazado"}

WORKFLOW_TRANSITIONS: dict[str, set[str]] = {
    state: (_KANBAN_STATES - {state})
    for state in _KANBAN_STATES
} | {"archivado": set()}


def _require_value(value: str, field_name: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} requerido")
    return cleaned


def _assert_document_access(document_id: str, user_id: str) -> None:
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.get(
                f"{settings.DOCUMENT_SERVICE_URL}/internal/documents/{document_id}/access",
                headers={"X-User-Id": user_id},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo validar acceso al documento",
        ) from exc

    if response.status_code in {
        status.HTTP_401_UNAUTHORIZED,
        status.HTTP_403_FORBIDDEN,
        status.HTTP_404_NOT_FOUND,
    }:
        raise HTTPException(status_code=response.status_code, detail="No puedes ver este documento")
    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="document-service rechazo la validacion de acceso",
        )


@router.get("/{document_id}/history", response_model=list[WorkflowHistoryItem])
def get_document_workflow_history(
    document_id: str,
    db: Session = Depends(get_db),
):
    document_id = _require_value(document_id, "Documento")
    rows = (
        db.query(DocumentState)
        .filter(DocumentState.document_id == document_id)
        .order_by(DocumentState.created_at.desc())
        .all()
    )
    return [
        WorkflowHistoryItem(
            id=row.id,
            actor_user_id=row.changed_by_user_id,
            action="state_change",
            body=row.state_code,
            created_at=row.created_at.isoformat(),
        )
        for row in rows
    ]


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


@router.post("/batch-states", response_model=BatchStatesResponse)
def get_batch_document_states(
    body: BatchStatesRequest,
    db: Session = Depends(get_db),
):
    if not body.document_ids:
        return BatchStatesResponse(states={})
    rows = (
        db.query(DocumentState.document_id, DocumentState.state_code)
        .filter(
            DocumentState.document_id.in_(body.document_ids),
            DocumentState.is_current.is_(True),
        )
        .all()
    )
    return BatchStatesResponse(states={doc_id: state for doc_id, state in rows})


@public_router.get("/{document_id}", response_model=DocumentWorkflowDetailResponse)
def get_document_workflow_detail(
    document_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    document_id = _require_value(document_id, "Documento")
    _assert_document_access(document_id, x_user_id)
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


@public_router.post("/assignment-counts", response_model=AssignmentCountsResponse)
def get_assignment_counts(
    body: AssignmentCountsRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    if not body.document_ids:
        return AssignmentCountsResponse(counts={})

    rows = (
        db.query(DocumentAssignment.document_id, DocumentAssignment.id)
        .filter(
            DocumentAssignment.document_id.in_(body.document_ids),
            DocumentAssignment.is_active.is_(True),
        )
        .all()
    )

    counts: dict[str, int] = {doc_id: 0 for doc_id in body.document_ids}
    for document_id, _ in rows:
        counts[document_id] = counts.get(document_id, 0) + 1

    return AssignmentCountsResponse(counts=counts)


@public_router.patch("/{document_id}/state", response_model=ChangeDocumentStateResponse)
def change_document_state(
    document_id: str,
    body: ChangeDocumentStateRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    document_id = _require_value(document_id, "Documento")
    new_state = _require_value(body.new_state_code, "Estado")

    if new_state not in VALID_STATES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Estado inválido: {new_state}")

    current_state = (
        db.query(DocumentState)
        .filter(DocumentState.document_id == document_id, DocumentState.is_current.is_(True))
        .first()
    )
    if not current_state:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento sin estado en workflow")

    allowed = WORKFLOW_TRANSITIONS.get(current_state.state_code, set())
    if new_state not in allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Transición no permitida: {current_state.state_code} → {new_state}",
        )

    has_assignment = (
        db.query(DocumentAssignment)
        .filter(
            DocumentAssignment.document_id == document_id,
            DocumentAssignment.user_id == x_user_id,
            DocumentAssignment.is_active.is_(True),
        )
        .first()
    )
    if not has_assignment:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes asignación activa en este documento")

    previous_code = current_state.state_code
    current_state.is_current = False

    new_state_record = DocumentState(
        document_id=document_id,
        state_code=new_state,
        changed_by_user_id=x_user_id,
        is_current=True,
    )
    db.add(new_state_record)
    db.commit()
    db.refresh(new_state_record)

    return ChangeDocumentStateResponse(
        document_id=document_id,
        previous_state_code=previous_code,
        new_state_code=new_state,
        changed_by_user_id=x_user_id,
        changed_at=new_state_record.created_at.isoformat(),
    )
