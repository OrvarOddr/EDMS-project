import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, String
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    __table_args__ = {"schema": "auth"}

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=False, index=True)
    token_hash = Column(String, unique=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    created_by_ip = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
