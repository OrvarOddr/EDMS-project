import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, JSON, String
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = {"schema": "auth"}

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    actor_user_id = Column(String, nullable=True, index=True)
    target_user_id = Column(String, nullable=True, index=True)
    action = Column(String, nullable=False, index=True)
    resource_type = Column(String, nullable=False, index=True)
    resource_id = Column(String, nullable=True, index=True)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
