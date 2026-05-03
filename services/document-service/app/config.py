from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    SERVICE_PORT: int = 8002
    WORKFLOW_SERVICE_URL: str = "http://workflow-service:8003"
    FILE_SERVICE_URL: str = "http://file-service:8005"
    COLLABORATION_SERVICE_URL: str = "http://collaboration-service:8004"

    class Config:
        env_file = ".env"


settings = Settings()
