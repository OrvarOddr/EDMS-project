import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, String, Text
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Expedient(Base):
    """Expediente: agrupador formal de documentos relacionados (US-029/US-030).

    El `code` es opcional pero unico cuando se usa; permite identificar el
    expediente por una clave de negocio (ej. "EXP-2026-001") aparte del id
    interno. La relacion documento -> expediente se modela en
    `Document.expedient_id` (ya existente).
    """

    __tablename__ = "expedients"
    __table_args__ = {"schema": "documents"}

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    code = Column(String, nullable=True, index=True)
    description = Column(Text, nullable=True)
    created_by_user_id = Column(String, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
