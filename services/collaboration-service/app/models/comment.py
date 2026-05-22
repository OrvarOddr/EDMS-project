import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, String, Text

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Comment(Base):
    __tablename__ = "comments"
    __table_args__ = {"schema": "collaboration"}

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String, nullable=False, index=True)
    author_user_id = Column(String, nullable=False, index=True)
    body = Column(Text, nullable=False)
    version_id = Column(String, nullable=True, index=True)
    mentions = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    # US-022: marcar comentario como resuelto. Conservamos la fila para no
    # perder el historial; solo se marca con quien y cuando.
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolved_by_user_id = Column(String, nullable=True)
