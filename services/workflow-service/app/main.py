from contextlib import asynccontextmanager
from fastapi import FastAPI
from sqlalchemy import text
from app.database import engine, Base
from app.routers import health
from app.routers import documents


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE workflow.document_states ADD COLUMN IF NOT EXISTS comment TEXT"))
        conn.commit()
    yield


app = FastAPI(title="workflow-service", lifespan=lifespan)
app.include_router(health.router)
app.include_router(documents.router)
app.include_router(documents.public_router)
