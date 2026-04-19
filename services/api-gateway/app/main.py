from fastapi import FastAPI
from app.routers import health

app = FastAPI(title="api-gateway")
app.include_router(health.router)
