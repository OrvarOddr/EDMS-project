from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.database import engine, Base
from app.routers import health, documents


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="collaboration-service", lifespan=lifespan)
app.include_router(health.router)
app.include_router(documents.router)
