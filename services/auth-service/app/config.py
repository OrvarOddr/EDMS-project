from pydantic import field_validator
from pydantic_settings import BaseSettings

WEAK_JWT_SECRETS = {
    "cambia_esto",
    "cambia_esto_por_un_valor_aleatorio_de_32_caracteres",
    "changeme",
    "secret",
}


class Settings(BaseSettings):
    DATABASE_URL: str
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ISSUER: str = "edms-auth"
    JWT_AUDIENCE: str = "edms"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    SERVICE_PORT: int = 8001

    @field_validator("JWT_SECRET_KEY")
    @classmethod
    def validate_jwt_secret(cls, value: str) -> str:
        if len(value) < 32 or value.strip().lower() in WEAK_JWT_SECRETS:
            raise ValueError("JWT_SECRET_KEY debe tener al menos 32 caracteres y no ser un placeholder")
        return value

    class Config:
        env_file = ".env"


settings = Settings()
