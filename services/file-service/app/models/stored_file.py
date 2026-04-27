import uuid
from datetime import datetime, timezone
from sqlalchemy import BigInteger, Column, DateTime, String
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class StoredFile(Base):
    __tablename__ = "stored_files"
    __table_args__ = {"schema": "files"}

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    original_filename = Column(String, nullable=False)
    stored_filename = Column(String, nullable=False, unique=True)
    mime_type = Column(String, nullable=False, index=True)
    size_bytes = Column(BigInteger, nullable=False)
    storage_backend = Column(String, nullable=False)
    storage_path = Column(String, nullable=False)
    checksum = Column(String, nullable=True)
    uploader_user_id = Column(String, nullable=False, index=True)
    uploaded_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
