from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Role, UserRole, User
from app.schemas import RoleResponse, AssignRoleRequest
from app.routers.users import _current_user

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("", response_model=list[RoleResponse])
def list_roles(db: Session = Depends(get_db), _: User = Depends(_current_user)):
    roles = db.query(Role).all()
    return [RoleResponse(id=r.id, code=r.code, name=r.name, description=r.description) for r in roles]


@router.post("/assign", status_code=status.HTTP_204_NO_CONTENT)
def assign_role(
    body: AssignRoleRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(_current_user),
):
    if not actor.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo superusuarios pueden asignar roles")

    target = db.query(User).filter(User.id == body.user_id, User.deleted_at == None).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    role = db.query(Role).filter(Role.id == body.role_id).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rol no encontrado")

    existing = db.query(UserRole).filter(
        UserRole.user_id == body.user_id,
        UserRole.role_id == body.role_id,
        UserRole.is_active == True,
    ).first()
    if existing:
        return

    assignment = UserRole(
        user_id=body.user_id,
        role_id=body.role_id,
        assigned_by_user_id=actor.id,
    )
    db.add(assignment)
    db.commit()
