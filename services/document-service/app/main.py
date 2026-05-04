from contextlib import asynccontextmanager
from sqlalchemy import text
from fastapi import FastAPI
from app.database import engine, Base
from app.routers import health
from app.routers import versions
from app.routers import tags


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_document_versions_document_number "
            "ON documents.document_versions (document_id, version_number)"
        ))
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_document_versions_current "
            "ON documents.document_versions (document_id) WHERE is_current = true"
        ))
    yield


app = FastAPI(title="document-service", lifespan=lifespan)
app.include_router(health.router)
app.include_router(versions.router)
app.include_router(versions.internal_router)
app.include_router(tags.router)
