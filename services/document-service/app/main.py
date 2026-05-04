from contextlib import asynccontextmanager
import httpx
from sqlalchemy import text
from fastapi import FastAPI
from app.config import settings
from app.database import engine, Base, SessionLocal
from app.models import DocumentVersion
from app.routers import health
from app.routers import versions
from app.routers import tags


def _backfill_mime_types() -> None:
    with SessionLocal() as db:
        rows = (
            db.query(DocumentVersion.id, DocumentVersion.file_id)
            .filter(DocumentVersion.mime_type.is_(None))
            .all()
        )
        if not rows:
            return
        file_ids = [file_id for _, file_id in rows]
        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(
                    f"{settings.FILE_SERVICE_URL}/internal/files/batch-metadata",
                    json={"file_ids": file_ids},
                )
            if resp.status_code >= 400:
                return
            meta_map = {item["file_id"]: item for item in resp.json()}
        except httpx.HTTPError:
            return
        for version_id, file_id in rows:
            meta = meta_map.get(file_id)
            if not meta:
                continue
            db.query(DocumentVersion).filter(DocumentVersion.id == version_id).update(
                {"mime_type": meta.get("mime_type"), "original_filename": meta.get("original_filename")},
                synchronize_session=False,
            )
        db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE documents.document_versions ADD COLUMN IF NOT EXISTS mime_type VARCHAR"))
        conn.execute(text("ALTER TABLE documents.document_versions ADD COLUMN IF NOT EXISTS original_filename VARCHAR"))
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_document_versions_document_number "
            "ON documents.document_versions (document_id, version_number)"
        ))
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_document_versions_current "
            "ON documents.document_versions (document_id) WHERE is_current = true"
        ))
    _backfill_mime_types()
    yield


app = FastAPI(title="document-service", lifespan=lifespan)
app.include_router(health.router)
app.include_router(versions.router)
app.include_router(versions.internal_router)
app.include_router(tags.router)
