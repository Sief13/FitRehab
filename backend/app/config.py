from pydantic_settings import BaseSettings, SettingsConfigDict

INSECURE_DEFAULT_KEY = "change-me"


class Settings(BaseSettings):
    """Reads values from environment variables or from the .env file."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    database_url: str = "sqlite:///./fitrehab.db"
    secret_key: str = INSECURE_DEFAULT_KEY
    access_token_minutes: int = 60 * 24
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"


settings = Settings()

# Refuse to start in production with the placeholder key: anyone could forge tokens.
if not settings.is_development and settings.secret_key == INSECURE_DEFAULT_KEY:
    raise RuntimeError("SECRET_KEY must be set to a long random value when APP_ENV is not 'development'.")
