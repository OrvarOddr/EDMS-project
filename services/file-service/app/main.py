from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.database import engine, Base
from app.routers import health
from app.routers import files


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="file-service", lifespan=lifespan)
app.include_router(health.router)
app.include_router(files.router)
app.include_router(files.internal_router)
