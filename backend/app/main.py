from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models  # noqa: F401  (importing registers the tables on Base)
from app.config import settings
from app.database import Base, engine
from app.routers import auth, dev, sessions


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Creates missing tables on startup. (Alembic migrations can replace this later.)
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="FitRehab AI API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(sessions.router)
if settings.is_development:
    app.include_router(dev.router)


@app.get("/api/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}
