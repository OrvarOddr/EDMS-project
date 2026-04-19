from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SERVICE_PORT: int = 8000
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    AUTH_SERVICE_URL: str = "http://auth-service:8001"
    DOCUMENT_SERVICE_URL: str = "http://document-service:8002"
    WORKFLOW_SERVICE_URL: str = "http://workflow-service:8003"
    COLLABORATION_SERVICE_URL: str = "http://collaboration-service:8004"
    FILE_SERVICE_URL: str = "http://file-service:8005"

    class Config:
        env_file = ".env"


settings = Settings()
