import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, String
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class ExpedientFolder(Base):
    """Carpeta dentro de un expediente (un solo nivel).

    Los documentos referencian la carpeta via `Document.folder_id`. Si el
    documento tiene `expedient_id` y `folder_id` null, esta en la raiz
    del expediente; si tiene los dos, esta dentro de la carpeta.
    """

    __tablename__ = "expedient_folders"
    __table_args__ = {"schema": "documents"}

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    expedient_id = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    created_by_user_id = Column(String, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
