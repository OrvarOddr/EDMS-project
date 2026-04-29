import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Integer, JSON, String, Text
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


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = {"schema": "documents"}

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    code = Column(String, unique=True, nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    document_type_id = Column(String, nullable=True, index=True)
    expedient_id = Column(String, nullable=True, index=True)
    confidentiality_level = Column(String, nullable=False, default="publico_interno")
    metadata_json = Column(JSON, nullable=True)
    owner_user_id = Column(String, nullable=False, index=True)
    created_by_user_id = Column(String, nullable=False, index=True)
    due_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)
    archived_at = Column(DateTime(timezone=True), nullable=True)
