from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    SERVICE_PORT: int = 8003
    DOCUMENT_SERVICE_URL: str = "http://document-service:8002"
    COLLABORATION_SERVICE_URL: str = "http://collaboration-service:8004"

    class Config:
        env_file = ".env"


settings = Settings()
