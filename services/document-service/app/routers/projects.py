"""Proyectos: nivel superior que agrupa expedientes.

Jerarquía: Proyecto -> Expedientes -> Carpetas -> Documentos. Los proyectos son
la entrada principal del sistema; la pantalla de Proyectos consume `GET /projects`.
La visibilidad por rol vive aquí (admin ve todos; el resto solo donde participa).
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Document, Expedient, Project
from app.routers.versions import (
    _can_view_document,
    _fetch_batch_workflow_summaries,
    _is_admin,
)
from app.schemas import CreateProjectRequest, ProjectResponse

router = APIRouter(prefix="/projects", tags=["projects"])

# Estados de workflow usados para derivar progreso/estado del proyecto.
_TERMINAL_STATES = {"aprobado", "archivado"}
_PENDING_STATES = {"en_revision", "pendiente_firma", "observado"}


def _require_user(x_user_id: str | None) -> str:
    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario autenticado requerido")
    return x_user_id


def _base_response(project: Project, **extra) -> ProjectResponse:
    return ProjectResponse(
        id=project.id,
        name=project.name,
        code=project.code,
        description=project.description,
        created_by_user_id=project.created_by_user_id,
        created_at=project.created_at.isoformat(),
        **extra,
    )


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    body: CreateProjectRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
):
    actor_user_id = _require_user(x_user_id)
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nombre requerido")
    code = (body.code or "").strip() or None
    description = (body.description or "").strip() or None

    if code and db.query(Project).filter(Project.code == code).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe un proyecto con el codigo '{code}'",
        )

    project = Project(name=name, code=code, description=description, created_by_user_id=actor_user_id)
    db.add(project)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Codigo de proyecto duplicado")
    db.refresh(project)
    return _base_response(project)


@router.get("", response_model=list[ProjectResponse])
def list_projects(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
    db: Session = Depends(get_db),
):
    """Lista de proyectos con visibilidad por rol + datos derivados.

    - admin: ve todos los proyectos.
    - resto: solo donde participa (creó el proyecto o puede ver >=1 documento de
      alguno de sus expedientes; la participación se deriva de las asignaciones
      de workflow).

    Cada proyecto trae document_count, member_user_ids, progress (% terminal),
    status, pending_count y updated_at, agregados sobre los documentos visibles
    de todos sus expedientes.
    """
    actor_user_id = _require_user(x_user_id)
    is_admin = _is_admin(x_user_roles)
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    if not projects:
        return []

    # expediente -> proyecto
    expedients = (
        db.query(Expedient)
        .filter(Expedient.project_id.in_([p.id for p in projects]))
        .all()
    )
    exp_to_project = {exp.id: exp.project_id for exp in expedients}

    documents = []
    if exp_to_project:
        documents = (
            db.query(Document)
            .filter(
                Document.expedient_id.in_(list(exp_to_project.keys())),
                Document.archived_at.is_(None),
            )
            .all()
        )
    summary_map = _fetch_batch_workflow_summaries([doc.id for doc in documents])
    now = datetime.now(timezone.utc)

    agg: dict[str, dict] = {
        p.id: {"count": 0, "terminal": 0, "pending": 0, "overdue": False, "members": [], "updated": None}
        for p in projects
    }
    for doc in documents:
        project_id = exp_to_project.get(doc.expedient_id)
        if project_id is None:
            continue
        summary = summary_map.get(doc.id)
        if not _can_view_document(doc, actor_user_id, summary, is_admin=is_admin):
            continue
        bucket = agg[project_id]
        bucket["count"] += 1
        state_code = (summary or {}).get("state_code")
        if state_code in _TERMINAL_STATES:
            bucket["terminal"] += 1
        elif state_code in _PENDING_STATES:
            bucket["pending"] += 1
        if doc.due_at is not None and doc.due_at < now and state_code not in _TERMINAL_STATES:
            bucket["overdue"] = True
        for uid in [(summary or {}).get("assignee_user_id"), *((summary or {}).get("assigned_user_ids") or [])]:
            if uid and uid not in bucket["members"]:
                bucket["members"].append(uid)
        if doc.updated_at is not None and (bucket["updated"] is None or doc.updated_at > bucket["updated"]):
            bucket["updated"] = doc.updated_at

    result = []
    for project in projects:
        bucket = agg[project.id]
        count = bucket["count"]
        participates = project.created_by_user_id == actor_user_id or count > 0
        if not (is_admin or participates):
            continue

        progress = round(100 * bucket["terminal"] / count) if count else 0
        if count == 0:
            status_code = "en-pausa"
        elif bucket["overdue"]:
            status_code = "en-riesgo"
        elif progress == 100:
            status_code = "completado"
        else:
            status_code = "activo"

        updated = bucket["updated"] or project.created_at
        result.append(
            _base_response(
                project,
                document_count=count,
                member_user_ids=bucket["members"],
                progress=progress,
                status=status_code,
                pending_count=bucket["pending"],
                updated_at=updated.isoformat(),
            )
        )
    return result
