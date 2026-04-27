import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class DocumentVersion(Base):
    __tablename__ = "document_versions"
    __table_args__ = {"schema": "documents"}

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String, nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    file_id = Column(String, nullable=False, index=True)
    uploaded_by_user_id = Column(String, nullable=False, index=True)
    version_comment = Column(Text, nullable=True)
    checksum = Column(String, nullable=True)
    is_current = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
