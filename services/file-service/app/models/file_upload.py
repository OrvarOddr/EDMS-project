import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, String, Text
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class FileUpload(Base):
    __tablename__ = "file_uploads"
    __table_args__ = {"schema": "files"}

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    stored_file_id = Column(String, nullable=False, index=True)
    document_id = Column(String, nullable=True, index=True)
    document_version_id = Column(String, nullable=True, index=True)
    uploader_user_id = Column(String, nullable=False, index=True)
    upload_status = Column(String, nullable=False, index=True)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    completed_at = Column(DateTime(timezone=True), nullable=True)
