from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    SERVICE_PORT: int = 8004
    DOCUMENT_SERVICE_URL: str = "http://document-service:8002"
    WORKFLOW_SERVICE_URL: str = "http://workflow-service:8003"

    class Config:
        env_file = ".env"


settings = Settings()
