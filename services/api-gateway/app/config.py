from pydantic import field_validator
from pydantic_settings import BaseSettings

WEAK_JWT_SECRETS = {
    "cambia_esto",
    "cambia_esto_por_un_valor_aleatorio_de_32_caracteres",
    "changeme",
    "secret",
}


class Settings(BaseSettings):
    SERVICE_PORT: int = 8000
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ISSUER: str = "edms-auth"
    JWT_AUDIENCE: str = "edms"
    AUTH_SERVICE_URL: str = "http://auth-service:8001"
    DOCUMENT_SERVICE_URL: str = "http://document-service:8002"
    WORKFLOW_SERVICE_URL: str = "http://workflow-service:8003"
    COLLABORATION_SERVICE_URL: str = "http://collaboration-service:8004"
    FILE_SERVICE_URL: str = "http://file-service:8005"

    @field_validator("JWT_SECRET_KEY")
    @classmethod
    def validate_jwt_secret(cls, value: str) -> str:
        if len(value) < 32 or value.strip().lower() in WEAK_JWT_SECRETS:
            raise ValueError("JWT_SECRET_KEY debe tener al menos 32 caracteres y no ser un placeholder")
        return value

    class Config:
        env_file = ".env"


settings = Settings()
