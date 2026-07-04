import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, String, Text
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Project(Base):
    """Proyecto: agrupador de nivel superior que contiene expedientes.

    Jerarquía: Proyecto -> Expedientes (Expedient.project_id) -> Carpetas ->
    Documentos. El proyecto NO es un expediente; es la entrada principal del
    sistema. El `code` es opcional pero único cuando se usa.
    """

    __tablename__ = "projects"
    __table_args__ = {"schema": "documents"}

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    code = Column(String, nullable=True, index=True)
    description = Column(Text, nullable=True)
    # Coordinador (responsable) del proyecto. Por defecto es el creador.
    coordinator_user_id = Column(String, nullable=True, index=True)
    created_by_user_id = Column(String, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class ProjectMember(Base):
    """Miembro asignado explícitamente a un proyecto (colaborador)."""

    __tablename__ = "project_members"
    __table_args__ = {"schema": "documents"}

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
