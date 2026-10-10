import secrets

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import models  # noqa: F401  (importing registers the tables on Base)
from app.config import settings
from app.routers import auth, billing, dev, plans, rehab, sessions

# NOTE: tables are no longer created at startup. The database schema is managed by
# Alembic migrations: run `alembic upgrade head` (the Docker entrypoint does this).


def create_app() -> FastAPI:
    dev_mode = settings.is_development

    app = FastAPI(
        title="FitRehab AI API",
        version="0.5.0",
        # The interactive docs describe every endpoint: useful for us, not for the public internet.
        docs_url="/docs" if dev_mode else None,
        redoc_url=None,
        openapi_url="/openapi.json" if dev_mode else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def require_origin_secret(request: Request, call_next):
        """Only accept requests that came through CloudFront (when ORIGIN_SECRET is configured)."""
        expected = settings.origin_secret
        if expected and request.url.path != "/api/health":
            supplied = request.headers.get("x-origin-verify", "")
            if not secrets.compare_digest(supplied.encode(), expected.encode()):
                return JSONResponse({"detail": "Forbidden"}, status_code=403)
        return await call_next(request)

    app.include_router(auth.router)
    app.include_router(sessions.router)
    app.include_router(rehab.router)
    app.include_router(billing.router)
    app.include_router(plans.router)
    if dev_mode:
        app.include_router(dev.router)

    @app.get("/api/health", tags=["system"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
