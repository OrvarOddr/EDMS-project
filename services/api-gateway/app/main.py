from fastapi import FastAPI
from app.routers import health
from app.routers.proxy import router as proxy_router

app = FastAPI(title="api-gateway")
app.include_router(health.router)
app.include_router(proxy_router)
