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

            if "users" in table_names and sync_conn.dialect.name == "sqlite":
                user_info = sync_conn.execute(text("PRAGMA table_info(users)")).fetchall()
                cols_dict = {col[1]: col for col in user_info}
                tenant_id_col = cols_dict.get("tenant_id")
                
                if tenant_id_col and tenant_id_col[3] == 1:
                    sync_conn.execute(text("PRAGMA foreign_keys = OFF"))
                    sync_conn.execute(text("""
                        CREATE TABLE users_temp (
                            id VARCHAR(36) PRIMARY KEY,
                            created_at DATETIME NOT NULL,
                            updated_at DATETIME NOT NULL,
                            tenant_id VARCHAR(36),
                            full_name VARCHAR(255) NOT NULL,
                            email VARCHAR(255) NOT NULL,
                            hashed_password VARCHAR(255) NOT NULL,
                            role VARCHAR(50) NOT NULL,
                            is_active BOOLEAN NOT NULL,
                            email_verified BOOLEAN DEFAULT 0 NOT NULL,
                            email_verified_at DATETIME,
                            last_login_at DATETIME,
                            pending_library_name VARCHAR(255),
                            pending_phone VARCHAR(50),
                            pending_city VARCHAR(100),
                            pending_address TEXT,
                            pending_state VARCHAR(100),
                            pending_pincode VARCHAR(20),
                            pending_additional_email VARCHAR(255),
                            FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
                        )
                    """))
                    sync_conn.execute(text("""
                        INSERT INTO users_temp (id, created_at, updated_at, tenant_id, full_name, email, hashed_password, role, is_active, last_login_at, email_verified, email_verified_at)
                        SELECT id, created_at, updated_at, tenant_id, full_name, email, hashed_password, role, is_active, last_login_at, 1, CURRENT_TIMESTAMP
                        FROM users
                    """))
                    sync_conn.execute(text("DROP TABLE users"))
                    sync_conn.execute(text("ALTER TABLE users_temp RENAME TO users"))
                    sync_conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_tenant_id ON users (tenant_id)"))
                    sync_conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_email ON users (email)"))
                    sync_conn.execute(text("PRAGMA foreign_keys = ON"))
                else:
                    user_columns = [c[1] for c in user_info]
                    if "email_verified" not in user_columns:
                        sync_conn.execute(text("ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT 0"))
                        sync_conn.execute(text("UPDATE users SET email_verified = 1 WHERE email_verified IS NULL OR email_verified = 0"))
                    if "email_verified_at" not in user_columns:
                        sync_conn.execute(text("ALTER TABLE users ADD COLUMN email_verified_at DATETIME"))
                    if "pending_library_name" not in user_columns:
                        sync_conn.execute(text("ALTER TABLE users ADD COLUMN pending_library_name VARCHAR(255)"))
                    if "pending_phone" not in user_columns:
                        sync_conn.execute(text("ALTER TABLE users ADD COLUMN pending_phone VARCHAR(50)"))
                    if "pending_city" not in user_columns:
                        sync_conn.execute(text("ALTER TABLE users ADD COLUMN pending_city VARCHAR(100)"))
                    if "pending_address" not in user_columns:
                        sync_conn.execute(text("ALTER TABLE users ADD COLUMN pending_address TEXT"))
                    if "pending_state" not in user_columns:
                        sync_conn.execute(text("ALTER TABLE users ADD COLUMN pending_state VARCHAR(100)"))
                    if "pending_pincode" not in user_columns:
                        sync_conn.execute(text("ALTER TABLE users ADD COLUMN pending_pincode VARCHAR(20)"))
                    if "pending_additional_email" not in user_columns:
                        sync_conn.execute(text("ALTER TABLE users ADD COLUMN pending_additional_email VARCHAR(255)"))

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
