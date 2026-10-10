from pydantic_settings import BaseSettings, SettingsConfigDict

INSECURE_DEFAULT_KEY = "change-me"


class Settings(BaseSettings):
    """Reads values from environment variables or from the .env file."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # "development" enables /docs and the /api/dev tools. Anything else is treated as production.
    app_env: str = "development"
    # SQLite for local development. PostgreSQL in production, for example:
    #   postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME
    database_url: str = "sqlite:///./fitrehab.db"
    secret_key: str = INSECURE_DEFAULT_KEY
    access_token_minutes: int = 60 * 24
    cors_origins: str = "http://localhost:5173"

    # When set, every request (except /api/health) must carry the header
    #   X-Origin-Verify: <this value>
    # CloudFront adds it, so the API cannot be reached by going around CloudFront.
    origin_secret: str = ""

    # Premium: one payment buys `premium_period_days` days of Premium (amounts are in cents)
    premium_price_cents: int = 14900
    premium_currency: str = "EGP"
    premium_period_days: int = 30

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
