"""US-005: permisos por documento.

Tabla `document_permission_grants` que registra los permisos explicitos
(no derivados de workflow) que un propietario otorga sobre un documento
a otro usuario.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, String

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class DocumentPermissionGrant(Base):
    __tablename__ = "document_permission_grants"
    __table_args__ = {"schema": "collaboration"}

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String, nullable=False, index=True)
    grantee_user_id = Column(String, nullable=False, index=True)
    permission_code = Column(String, nullable=False, index=True)
    granted_by_user_id = Column(String, nullable=False, index=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    granted_at = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    # US-007: expiracion opcional. Un grant con expires_at <= now() se considera
    # inactivo para autorizacion aunque is_active sea True. La UI lo muestra
    # como "Expirado" en la lista del owner.
    expires_at = Column(DateTime(timezone=True), nullable=True)
