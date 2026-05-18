from contextlib import asynccontextmanager
from fastapi import FastAPI
from sqlalchemy import text
from app.database import engine, Base
from app.routers import health, documents, notifications, activity


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE collaboration.comments ADD COLUMN IF NOT EXISTS version_id VARCHAR"))
        conn.execute(text("ALTER TABLE collaboration.comments ADD COLUMN IF NOT EXISTS mentions TEXT"))
        conn.execute(text("ALTER TABLE collaboration.notifications ADD COLUMN IF NOT EXISTS source_id VARCHAR"))
        conn.execute(text("ALTER TABLE collaboration.notifications ADD COLUMN IF NOT EXISTS document_name VARCHAR"))
        conn.commit()
    yield


app = FastAPI(title="collaboration-service", lifespan=lifespan)
app.include_router(health.router)
app.include_router(documents.router)
app.include_router(notifications.router)
app.include_router(notifications.internal_router)
app.include_router(activity.router)
