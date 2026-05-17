import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, String, Text

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = {"schema": "collaboration"}

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    recipient_user_id = Column(String, nullable=False, index=True)
    actor_user_id = Column(String, nullable=True)
    document_id = Column(String, nullable=True, index=True)
    type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=True)
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    read_at = Column(DateTime(timezone=True), nullable=True)
