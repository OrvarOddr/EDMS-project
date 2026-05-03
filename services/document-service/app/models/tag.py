import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, String, UniqueConstraint
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = {"schema": "documents"}

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    label = Column(String, nullable=False)
    color = Column(String, nullable=False, default="#6366f1")
    created_by_user_id = Column(String, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)


class DocumentTag(Base):
    __tablename__ = "document_tags"
    __table_args__ = (
        UniqueConstraint("document_id", "tag_id"),
        {"schema": "documents"},
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String, nullable=False, index=True)
    tag_id = Column(String, nullable=False, index=True)
