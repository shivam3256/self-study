from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base
from app.api.v1 import api_router

# Import all models to ensure they are registered with Base.metadata
import app.models

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize tables on startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        def check_columns(sync_conn):
            from sqlalchemy import inspect, text
            inspector = inspect(sync_conn)
            table_names = inspector.get_table_names()
            if "tenants" in table_names:
                columns = [c["name"] for c in inspector.get_columns("tenants")]
                if "additional_email" not in columns:
                    sync_conn.execute(text("ALTER TABLE tenants ADD COLUMN additional_email VARCHAR(255)"))

        await conn.run_sync(check_columns)
    yield
    # Cleanup on shutdown
    await engine.dispose()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else ["*"],
    allow_origin_regex=r"^https://([a-zA-Z0-9-]+\.)*self-study\.pages\.dev$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["System"])
async def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION
    }

app.include_router(api_router, prefix=settings.API_V1_STR)
