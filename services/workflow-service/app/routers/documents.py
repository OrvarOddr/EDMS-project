from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import DocumentAssignment, DocumentState
from app.schemas import (
    AddAssignmentRequest,
    AssignmentCountsRequest,
    AssignmentCountsResponse,
    AssignDocumentAssigneeRequest,
    AssignDocumentAssigneeResponse,
    BatchStatesRequest,
    BatchStatesResponse,
    BatchWorkflowSummariesResponse,
    BatchWorkflowSummary,
    BootstrapDocumentWorkflowRequest,
    BootstrapDocumentWorkflowResponse,
    ChangeDocumentStateRequest,
    ChangeDocumentStateResponse,
    DocumentAssignmentResponse,
    DocumentWorkflowDetailResponse,
    UpdateAssignmentRoleRequest,
    WorkflowHistoryItem,
)

router = APIRouter(prefix="/internal/workflow/documents", tags=["workflow-documents"])
public_router = APIRouter(prefix="/workflow/documents", tags=["workflow-documents"])

INITIAL_STATE = "borrador"
OWNER_ROLE = "encargado"
# Roles que pueden gestionarse via endpoints de asignaciones (no-owner).
# El rol encargado se cambia mediante PATCH /workflow/documents/{id}/assignee.
NON_OWNER_ROLES: frozenset[str] = frozenset({"revisor", "aprobador", "lector"})
VALID_ROLES: frozenset[str] = NON_OWNER_ROLES | {OWNER_ROLE}

_ROLE_LABELS: dict[str, str] = {
    "encargado": "encargado",
    "revisor": "revisor",
    "aprobador": "aprobador",
    "lector": "lector",
}

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

# Estados a los que solo se puede pasar adjuntando un comentario obligatorio
# (US-015: el comentario de observación es obligatorio).
STATES_REQUIRING_COMMENT: frozenset[str] = frozenset({"observado", "rechazado"})

_STATE_LABELS: dict[str, str] = {
    "borrador": "Borrador",
    "en_revision": "En revisión",
    "observado": "Observado",
    "aprobado": "Aprobado",
    "pendiente_firma": "Pendiente de firma",
    "rechazado": "Rechazado",
    "archivado": "Archivado",
}


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


def _is_admin(x_user_roles: str | None) -> bool:
    if not x_user_roles:
        return False
    return "admin" in {role.strip() for role in x_user_roles.split(",") if role.strip()}


def _assert_document_permission(document_id: str, user_id: str, permission: str, x_user_roles: str | None = None) -> None:
    try:
        with httpx.Client(timeout=5.0) as client:
            headers = {"X-User-Id": user_id}
            if x_user_roles:
                headers["X-User-Roles"] = x_user_roles
            response = client.get(
                f"{settings.DOCUMENT_SERVICE_URL}/internal/documents/{document_id}/access",
                headers=headers,
                params={"permission": permission},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo validar permiso sobre el documento",
        ) from exc

    if response.status_code in {
        status.HTTP_401_UNAUTHORIZED,
        status.HTTP_403_FORBIDDEN,
        status.HTTP_404_NOT_FOUND,
    }:
        raise HTTPException(status_code=response.status_code, detail="No tienes permiso sobre este documento")
    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="document-service rechazo la validacion de permiso",
        )


def _notify_new_assignee(document_id: str, recipient_user_id: str, actor_user_id: str, assignment_id: str | None = None) -> None:
    """Best-effort: no debe bloquear la asignación si collaboration-service falla."""
    try:
        with httpx.Client(timeout=5.0) as client:
            client.post(
                f"{settings.COLLABORATION_SERVICE_URL}/internal/collaboration/notifications",
                json={
                    "recipient_user_id": recipient_user_id,
                    "actor_user_id": actor_user_id,
                    "document_id": document_id,
                    "source_id": assignment_id,
                    "type": "asignacion_encargado",
                    "title": "Te asignaron como encargado de un documento",
                    "body": f"Ahora eres el encargado del documento {document_id}.",
                },
            )
    except httpx.HTTPError:
        pass


def _notify_role_assignment(
    document_id: str,
    recipient_user_id: str,
    actor_user_id: str,
    assignment_id: str,
    role_code: str,
) -> None:
    """Notifica una asignacion de rol no-owner (revisor/aprobador/lector). Best-effort."""
    label = _ROLE_LABELS.get(role_code, role_code)
    try:
        with httpx.Client(timeout=5.0) as client:
            client.post(
                f"{settings.COLLABORATION_SERVICE_URL}/internal/collaboration/notifications",
                json={
                    "recipient_user_id": recipient_user_id,
                    "actor_user_id": actor_user_id,
                    "document_id": document_id,
                    "source_id": assignment_id,
                    "type": "asignacion_rol",
                    "title": f"Te asignaron como {label} de un documento",
                    "body": f"Ahora participas como {label} del documento {document_id}.",
                },
            )
    except httpx.HTTPError:
        pass


def _assert_actor_is_owner(db: Session, document_id: str, user_id: str, x_user_roles: str | None = None) -> None:
    """Solo el encargado activo puede gestionar otras asignaciones del documento.

    Admin bypass: si el caller es admin, puede gestionar asignaciones de
    cualquier documento del workspace.
    """
    owner = (
        db.query(DocumentAssignment)
        .filter(
            DocumentAssignment.document_id == document_id,
            DocumentAssignment.role_code == OWNER_ROLE,
            DocumentAssignment.is_active.is_(True),
        )
        .first()
    )
    if not owner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento sin workflow")
    if _is_admin(x_user_roles):
        return
    if owner.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el encargado puede gestionar asignaciones",
        )


def _notify_state_change(
    document_id: str,
    recipient_user_ids: list[str],
    actor_user_id: str,
    new_state_code: str,
    state_record_id: str,
    comment: str | None,
) -> None:
    """Best-effort: notifica a los asignados activos del documento sobre el cambio de estado."""
    state_label = _STATE_LABELS.get(new_state_code, new_state_code)
    title = f"Documento movido a {state_label}"
    body = comment.strip() if comment and comment.strip() else f"El documento cambió de estado a {state_label}."
    for recipient_user_id in recipient_user_ids:
        if recipient_user_id == actor_user_id:
            continue
        try:
            with httpx.Client(timeout=5.0) as client:
                client.post(
                    f"{settings.COLLABORATION_SERVICE_URL}/internal/collaboration/notifications",
                    json={
                        "recipient_user_id": recipient_user_id,
                        "actor_user_id": actor_user_id,
                        "document_id": document_id,
                        "source_id": state_record_id,
                        "type": "cambio_estado",
                        "title": title,
                        "body": body,
                    },
                )
        except httpx.HTTPError:
            pass


@router.get("/{document_id}/history", response_model=list[WorkflowHistoryItem])
def get_document_workflow_history(
    document_id: str,
    db: Session = Depends(get_db),
):
    document_id = _require_value(document_id, "Documento")
    state_rows = (
        db.query(DocumentState)
        .filter(DocumentState.document_id == document_id)
        .order_by(DocumentState.created_at.desc())
        .all()
    )
    assignment_rows = (
        db.query(DocumentAssignment)
        .filter(DocumentAssignment.document_id == document_id)
        .order_by(DocumentAssignment.assigned_at.desc())
        .all()
    )

    history = [
        WorkflowHistoryItem(
            id=row.id,
            actor_user_id=row.changed_by_user_id,
            action="state_change",
            body=row.state_code,
            note=row.comment,
            created_at=row.created_at.isoformat(),
        )
        for row in state_rows
    ]
    for row in assignment_rows:
        if row.role_code == OWNER_ROLE:
            action_added = "assignee_changed"
        else:
            action_added = "assignment_added"
        history.append(
            WorkflowHistoryItem(
                id=row.id,
                actor_user_id=row.assigned_by_user_id,
                action=action_added,
                body=row.user_id,
                note=row.role_code if row.role_code != OWNER_ROLE else None,
                created_at=row.assigned_at.isoformat(),
            )
        )
        if row.revoked_at is not None and row.role_code != OWNER_ROLE:
            history.append(
                WorkflowHistoryItem(
                    id=f"{row.id}-revoked",
                    actor_user_id=row.assigned_by_user_id,
                    action="assignment_removed",
                    body=row.user_id,
                    note=row.role_code,
                    created_at=row.revoked_at.isoformat(),
                )
            )
    return sorted(history, key=lambda item: item.created_at, reverse=True)


@router.get("/{document_id}/assignments", response_model=list[DocumentAssignmentResponse])
def get_document_active_assignments(
    document_id: str,
    db: Session = Depends(get_db),
):
    document_id = _require_value(document_id, "Documento")
    rows = (
        db.query(DocumentAssignment)
        .filter(
            DocumentAssignment.document_id == document_id,
            DocumentAssignment.is_active.is_(True),
        )
        .order_by(DocumentAssignment.assigned_at.asc())
        .all()
    )
    return [
        DocumentAssignmentResponse(
            id=row.id,
            user_id=row.user_id,
            role_code=row.role_code,
            assigned_by_user_id=row.assigned_by_user_id,
            assigned_at=row.assigned_at.isoformat(),
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
    assignee_id = _require_value(body.assignee_user_id, "Encargado") if body.assignee_user_id else creator_id

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
        user_id=assignee_id,
        role_code=OWNER_ROLE,
        assigned_by_user_id=creator_id,
    )
    db.add(state)
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    if assignee_id != creator_id:
        _notify_new_assignee(document_id, assignee_id, creator_id, assignment.id)

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


@router.post("/batch-summaries", response_model=BatchWorkflowSummariesResponse)
def get_batch_document_summaries(
    body: BatchStatesRequest,
    db: Session = Depends(get_db),
):
    if not body.document_ids:
        return BatchWorkflowSummariesResponse(summaries={})

    summaries = {
        document_id: BatchWorkflowSummary()
        for document_id in body.document_ids
    }
    state_rows = (
        db.query(DocumentState.document_id, DocumentState.state_code)
        .filter(
            DocumentState.document_id.in_(body.document_ids),
            DocumentState.is_current.is_(True),
        )
        .all()
    )
    for document_id, state_code in state_rows:
        summaries.setdefault(document_id, BatchWorkflowSummary()).state_code = state_code

    assignments = (
        db.query(DocumentAssignment)
        .filter(
            DocumentAssignment.document_id.in_(body.document_ids),
            DocumentAssignment.is_active.is_(True),
        )
        .order_by(DocumentAssignment.assigned_at.asc())
        .all()
    )
    for assignment in assignments:
        summary = summaries.setdefault(assignment.document_id, BatchWorkflowSummary())
        if assignment.user_id not in summary.assigned_user_ids:
            summary.assigned_user_ids.append(assignment.user_id)
        if assignment.role_code == OWNER_ROLE and summary.assignee_user_id is None:
            summary.assignee_user_id = assignment.user_id

    return BatchWorkflowSummariesResponse(summaries=summaries)


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


@public_router.patch("/{document_id}/assignee", response_model=AssignDocumentAssigneeResponse)
def assign_document_assignee(
    document_id: str,
    body: AssignDocumentAssigneeRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    document_id = _require_value(document_id, "Documento")
    new_assignee_id = _require_value(body.user_id, "Encargado")
    _assert_document_permission(document_id, x_user_id, "assign_assignee", x_user_roles=x_user_roles)

    active_owner_assignments = (
        db.query(DocumentAssignment)
        .filter(
            DocumentAssignment.document_id == document_id,
            DocumentAssignment.role_code == OWNER_ROLE,
            DocumentAssignment.is_active.is_(True),
        )
        .order_by(DocumentAssignment.assigned_at.desc())
        .all()
    )
    current_owner = active_owner_assignments[0] if active_owner_assignments else None
    previous_assignee_id = current_owner.user_id if current_owner else None

    if current_owner and current_owner.user_id == new_assignee_id and len(active_owner_assignments) == 1:
        return AssignDocumentAssigneeResponse(
            document_id=document_id,
            previous_assignee_user_id=previous_assignee_id,
            assignee_user_id=current_owner.user_id,
            assigned_by_user_id=current_owner.assigned_by_user_id,
            assigned_at=current_owner.assigned_at.isoformat(),
        )

    revoked_at = datetime.now(timezone.utc)
    for assignment in active_owner_assignments:
        assignment.is_active = False
        assignment.revoked_at = revoked_at

    assignment = DocumentAssignment(
        document_id=document_id,
        user_id=new_assignee_id,
        role_code=OWNER_ROLE,
        assigned_by_user_id=x_user_id,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    if new_assignee_id != x_user_id:
        _notify_new_assignee(document_id, new_assignee_id, x_user_id, assignment.id)

    return AssignDocumentAssigneeResponse(
        document_id=document_id,
        previous_assignee_user_id=previous_assignee_id,
        assignee_user_id=assignment.user_id,
        assigned_by_user_id=assignment.assigned_by_user_id,
        assigned_at=assignment.assigned_at.isoformat(),
    )


@public_router.patch("/{document_id}/state", response_model=ChangeDocumentStateResponse)
def change_document_state(
    document_id: str,
    body: ChangeDocumentStateRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
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

    if not _is_admin(x_user_roles):
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

    comment = body.comment.strip() if body.comment and body.comment.strip() else None
    if new_state in STATES_REQUIRING_COMMENT and not comment:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Se requiere un comentario para mover el documento a {_STATE_LABELS.get(new_state, new_state)}",
        )

    previous_code = current_state.state_code
    current_state.is_current = False

    new_state_record = DocumentState(
        document_id=document_id,
        state_code=new_state,
        changed_by_user_id=x_user_id,
        comment=comment,
        is_current=True,
    )
    db.add(new_state_record)
    db.commit()
    db.refresh(new_state_record)

    active_assignee_ids = [
        row.user_id
        for row in db.query(DocumentAssignment)
        .filter(
            DocumentAssignment.document_id == document_id,
            DocumentAssignment.is_active.is_(True),
        )
        .all()
    ]
    _notify_state_change(
        document_id=document_id,
        recipient_user_ids=active_assignee_ids,
        actor_user_id=x_user_id,
        new_state_code=new_state,
        state_record_id=new_state_record.id,
        comment=comment,
    )

    return ChangeDocumentStateResponse(
        document_id=document_id,
        previous_state_code=previous_code,
        new_state_code=new_state,
        changed_by_user_id=x_user_id,
        changed_at=new_state_record.created_at.isoformat(),
    )


@public_router.post(
    "/{document_id}/assignments",
    response_model=DocumentAssignmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_document_assignment(
    document_id: str,
    body: AddAssignmentRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    """Agrega una asignacion no-owner (revisor/aprobador/lector) al documento."""
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    document_id = _require_value(document_id, "Documento")
    user_id = _require_value(body.user_id, "Usuario")
    role_code = _require_value(body.role_code, "Rol")

    if role_code == OWNER_ROLE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El encargado se gestiona via PATCH /workflow/documents/{id}/assignee",
        )
    if role_code not in NON_OWNER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Rol invalido: {role_code}",
        )

    _assert_actor_is_owner(db, document_id, x_user_id, x_user_roles)

    duplicate = (
        db.query(DocumentAssignment)
        .filter(
            DocumentAssignment.document_id == document_id,
            DocumentAssignment.user_id == user_id,
            DocumentAssignment.role_code == role_code,
            DocumentAssignment.is_active.is_(True),
        )
        .first()
    )
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El usuario ya tiene ese rol asignado en el documento",
        )

    assignment = DocumentAssignment(
        document_id=document_id,
        user_id=user_id,
        role_code=role_code,
        assigned_by_user_id=x_user_id,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    if user_id != x_user_id:
        _notify_role_assignment(document_id, user_id, x_user_id, assignment.id, role_code)

    return DocumentAssignmentResponse(
        id=assignment.id,
        user_id=assignment.user_id,
        role_code=assignment.role_code,
        assigned_by_user_id=assignment.assigned_by_user_id,
        assigned_at=assignment.assigned_at.isoformat(),
    )


@public_router.delete(
    "/{document_id}/assignments/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_document_assignment(
    document_id: str,
    assignment_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    """Revoca una asignacion no-owner del documento (soft-delete)."""
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    document_id = _require_value(document_id, "Documento")
    assignment_id = _require_value(assignment_id, "Asignacion")

    _assert_actor_is_owner(db, document_id, x_user_id, x_user_roles)

    assignment = (
        db.query(DocumentAssignment)
        .filter(
            DocumentAssignment.id == assignment_id,
            DocumentAssignment.document_id == document_id,
            DocumentAssignment.is_active.is_(True),
        )
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asignacion no encontrada")
    if assignment.role_code == OWNER_ROLE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede quitar al encargado; cambialo via /assignee",
        )

    assignment.is_active = False
    assignment.revoked_at = datetime.now(timezone.utc)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@public_router.patch(
    "/{document_id}/assignments/{assignment_id}",
    response_model=DocumentAssignmentResponse,
)
def update_document_assignment_role(
    document_id: str,
    assignment_id: str,
    body: UpdateAssignmentRoleRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    """Cambia el rol de una asignacion no-owner.

    Se implementa revocando la asignacion anterior y creando una nueva, para
    dejar trazabilidad de altas y bajas en el historial.
    """
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")

    document_id = _require_value(document_id, "Documento")
    assignment_id = _require_value(assignment_id, "Asignacion")
    new_role = _require_value(body.role_code, "Rol")

    if new_role == OWNER_ROLE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Para volver a alguien encargado usa PATCH /assignee",
        )
    if new_role not in NON_OWNER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Rol invalido: {new_role}",
        )

    _assert_actor_is_owner(db, document_id, x_user_id, x_user_roles)

    assignment = (
        db.query(DocumentAssignment)
        .filter(
            DocumentAssignment.id == assignment_id,
            DocumentAssignment.document_id == document_id,
            DocumentAssignment.is_active.is_(True),
        )
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asignacion no encontrada")
    if assignment.role_code == OWNER_ROLE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede cambiar el rol del encargado desde este endpoint",
        )
    if assignment.role_code == new_role:
        return DocumentAssignmentResponse(
            id=assignment.id,
            user_id=assignment.user_id,
            role_code=assignment.role_code,
            assigned_by_user_id=assignment.assigned_by_user_id,
            assigned_at=assignment.assigned_at.isoformat(),
        )

    duplicate = (
        db.query(DocumentAssignment)
        .filter(
            DocumentAssignment.document_id == document_id,
            DocumentAssignment.user_id == assignment.user_id,
            DocumentAssignment.role_code == new_role,
            DocumentAssignment.is_active.is_(True),
        )
        .first()
    )
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El usuario ya tiene ese rol asignado en el documento",
        )

    revoked_at = datetime.now(timezone.utc)
    assignment.is_active = False
    assignment.revoked_at = revoked_at

    new_assignment = DocumentAssignment(
        document_id=document_id,
        user_id=assignment.user_id,
        role_code=new_role,
        assigned_by_user_id=x_user_id,
    )
    db.add(new_assignment)
    db.commit()
    db.refresh(new_assignment)

    if new_assignment.user_id != x_user_id:
        _notify_role_assignment(document_id, new_assignment.user_id, x_user_id, new_assignment.id, new_role)

    return DocumentAssignmentResponse(
        id=new_assignment.id,
        user_id=new_assignment.user_id,
        role_code=new_assignment.role_code,
        assigned_by_user_id=new_assignment.assigned_by_user_id,
        assigned_at=new_assignment.assigned_at.isoformat(),
    )


@router.get("/metrics/aggregates")
def get_workflow_metrics_aggregates(db: Session = Depends(get_db)):
    """US-027: agregados por estado actual y por encargado activo.

    Devuelve dos diccionarios:
    - by_state: { state_code: cantidad_de_documentos } usando DocumentState.is_current.
    - by_owner: { user_id_encargado: cantidad_de_documentos } usando
      DocumentAssignment.role_code='encargado' y is_active.
    """
    # Agregamos en Python para no agregar imports.
    state_pairs = (
        db.query(DocumentState.document_id, DocumentState.state_code)
        .filter(DocumentState.is_current.is_(True))
        .all()
    )
    by_state: dict[str, int] = {}
    for _, code in state_pairs:
        by_state[code] = by_state.get(code, 0) + 1

    owner_pairs = (
        db.query(DocumentAssignment.user_id, DocumentAssignment.document_id)
        .filter(
            DocumentAssignment.role_code == OWNER_ROLE,
            DocumentAssignment.is_active.is_(True),
        )
        .all()
    )
    by_owner: dict[str, int] = {}
    for user_id, _ in owner_pairs:
        by_owner[user_id] = by_owner.get(user_id, 0) + 1

    return {"by_state": by_state, "by_owner": by_owner}
