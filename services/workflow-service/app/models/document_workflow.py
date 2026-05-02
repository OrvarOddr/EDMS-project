import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, String

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class DocumentState(Base):
    __tablename__ = "document_states"
    __table_args__ = {"schema": "workflow"}

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String, nullable=False, index=True)
    state_code = Column(String, nullable=False, index=True)
    changed_by_user_id = Column(String, nullable=False, index=True)
    is_current = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class DocumentAssignment(Base):
    __tablename__ = "document_assignments"
    __table_args__ = {"schema": "workflow"}

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)
    role_code = Column(String, nullable=False, index=True)
    assigned_by_user_id = Column(String, nullable=False, index=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    assigned_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
