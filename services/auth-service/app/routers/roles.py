from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Role, UserRole, User
from app.schemas import RoleResponse, AssignRoleRequest, UserResponse
from app.routers.users import _current_user, _to_user_response

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("", response_model=list[RoleResponse])
def list_roles(db: Session = Depends(get_db), _: User = Depends(_current_user)):
    roles = db.query(Role).all()
    return [RoleResponse(id=r.id, code=r.code, name=r.name, description=r.description) for r in roles]


@router.post("/assign", response_model=UserResponse)
def assign_role(
    body: AssignRoleRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(_current_user),
):
    if not actor.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo superusuarios pueden asignar roles")

    target = db.query(User).filter(User.id == body.user_id, User.deleted_at.is_(None)).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    role = db.query(Role).filter(Role.id == body.role_id).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rol no encontrado")

    active_assignments = db.query(UserRole).filter(
        UserRole.user_id == body.user_id,
        UserRole.is_active.is_(True),
        UserRole.revoked_at.is_(None),
    ).all()

    now = datetime.now(timezone.utc)
    active_target_role = next((item for item in active_assignments if item.role_id == body.role_id), None)

    for assignment in active_assignments:
        if assignment is active_target_role:
            continue
        assignment.revoked_at = now
        assignment.is_active = False

    if not active_target_role:
        db.add(UserRole(
            user_id=body.user_id,
            role_id=body.role_id,
            assigned_by_user_id=actor.id,
        ))

    target.is_superuser = role.code == "admin"
    db.commit()
    db.refresh(target)

    return _to_user_response(db, target)
