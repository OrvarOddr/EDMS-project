from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    SERVICE_PORT: int = 8005
    STORAGE_BACKEND: str = "minio"
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_SECURE: bool = False
    MINIO_ACCESS_KEY: str
    MINIO_SECRET_KEY: str
    MINIO_BUCKET: str = "documents"
    MAX_FILE_SIZE_MB: int = 100
    DOCUMENT_SERVICE_URL: str = "http://document-service:8002"

    class Config:
        env_file = ".env"


settings = Settings()
