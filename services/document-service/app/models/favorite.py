import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, String, UniqueConstraint
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class DocumentFavorite(Base):
    """Marca un documento como favorito para un usuario.

    La preferencia es por usuario: cada par (user_id, document_id) es unico.
    No se considera para autorizacion, solo para listado y badges en la UI.
    """

    __tablename__ = "document_favorites"
    __table_args__ = (
        UniqueConstraint("user_id", "document_id", name="uq_document_favorites_user_doc"),
        {"schema": "documents"},
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=False, index=True)
    document_id = Column(String, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
