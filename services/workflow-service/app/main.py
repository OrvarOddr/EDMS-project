from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.database import engine, Base
from app.routers import health
from app.routers import documents


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="workflow-service", lifespan=lifespan)
app.include_router(health.router)
app.include_router(documents.router)
app.include_router(documents.public_router)
