from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# The value shipped in .env.example. It is long enough to pass min_length, and it is public.
PLACEHOLDER_JWT_SECRET = "replace-with-a-long-random-string-of-32-plus-chars"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    jwt_secret: str = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 12
    cors_origins: list[str] = ["http://localhost:3000"]

    @field_validator("jwt_secret")
    @classmethod
    def not_the_placeholder(cls, value: str) -> str:
        # Anyone could sign valid tokens with a key that is printed in the repository.
        if value == PLACEHOLDER_JWT_SECRET:
            raise ValueError(
                "JWT_SECRET is still the placeholder from .env.example; generate one with "
                'python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
