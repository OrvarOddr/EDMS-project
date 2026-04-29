import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, String
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class UserRole(Base):
    __tablename__ = "user_roles"
    __table_args__ = {"schema": "auth"}

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=False, index=True)
    role_id = Column(String, nullable=False, index=True)
    assigned_by_user_id = Column(String, nullable=True)
    assigned_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
