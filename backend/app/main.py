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
            if "tenants" in table_names:
                tenant_cols = [c["name"] for c in inspector.get_columns("tenants")]
                if "additional_email" not in tenant_cols:
                    sync_conn.execute(text("ALTER TABLE tenants ADD COLUMN additional_email VARCHAR(255)"))
                if "grace_period_days" not in tenant_cols:
                    sync_conn.execute(text("ALTER TABLE tenants ADD COLUMN grace_period_days INTEGER DEFAULT 5"))

            if "plans" in table_names:
                plan_cols = [c["name"] for c in inspector.get_columns("plans")]
                if "zone_id" not in plan_cols:
                    sync_conn.execute(text("ALTER TABLE plans ADD COLUMN zone_id VARCHAR(100)"))

            if "students" in table_names:
                student_columns = [c["name"] for c in inspector.get_columns("students")]
                if "gender" not in student_columns:
                    sync_conn.execute(text("ALTER TABLE students ADD COLUMN gender VARCHAR(20)"))

            if "desks" in table_names:
                sync_conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_desk_number ON desks (tenant_id, desk_number)"))

            # Data migration: populate plan_shifts for existing plans if empty
            if "plan_shifts" in table_names and "plans" in table_names and "shifts" in table_names:
                ps_count = sync_conn.execute(text("SELECT COUNT(*) FROM plan_shifts")).scalar()
                if ps_count == 0:
                    import uuid
                    from datetime import datetime, timezone
                    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                    existing_plans = sync_conn.execute(text("SELECT id, tenant_id, shift_type FROM plans")).fetchall()
                    for p in existing_plans:
                        p_id, t_id, s_type = p[0], p[1], (p[2] or "").lower()
                        t_shifts = sync_conn.execute(
                            text("SELECT id FROM shifts WHERE tenant_id = :tid AND is_active = true"),
                            {"tid": t_id}
                        ).fetchall()
                        if not t_shifts:
                            continue
                        if "full" in s_type:
                            target_shift_ids = [s[0] for s in t_shifts]
                        else:
                            target_shift_ids = [t_shifts[0][0]]
                        for sh_id in target_shift_ids:
                            sync_conn.execute(
                                text("""
                                    INSERT INTO plan_shifts (id, tenant_id, plan_id, shift_id, created_at, updated_at)
                                    VALUES (:id, :tid, :pid, :shid, :now, :now)
                                """),
                                {"id": str(uuid.uuid4()), "tid": t_id, "pid": p_id, "shid": sh_id, "now": now_str}
                            )

            # Data migration: populate allocations & allocation_shifts from legacy seat_allocations if empty
            if "seat_allocations" in table_names and "allocations" in table_names:
                alloc_count = sync_conn.execute(text("SELECT COUNT(*) FROM allocations")).scalar()
                if alloc_count == 0:
                    legacy_allocs = sync_conn.execute(
                        text("SELECT id, tenant_id, student_id, desk_id, shift_id, start_date, end_date, status, created_at, updated_at FROM seat_allocations")
                    ).fetchall()
                    import uuid
                    for la in legacy_allocs:
                        la_id, t_id, st_id, d_id, sh_id, s_date, e_date, status, c_at, u_at = la
                        new_status = "active" if status == "active" else "cancelled"
                        sync_conn.execute(
                            text("""
                                INSERT INTO allocations (id, tenant_id, student_id, seat_id, start_date, end_date, status, created_at, updated_at)
                                VALUES (:id, :tid, :stid, :seatid, :sdate, :edate, :status, :cat, :uat)
                            """),
                            {"id": la_id, "tid": t_id, "stid": st_id, "seatid": d_id, "sdate": s_date, "edate": e_date, "status": new_status, "cat": c_at, "uat": u_at}
                        )
                        sync_conn.execute(
                            text("""
                                INSERT INTO allocation_shifts (id, tenant_id, allocation_id, shift_id, seat_id, start_date, end_date, status, created_at, updated_at)
                                VALUES (:id, :tid, :aid, :shid, :seatid, :sdate, :edate, :status, :cat, :uat)
                            """),
                            {"id": str(uuid.uuid4()), "tid": t_id, "aid": la_id, "shid": sh_id, "seatid": d_id, "sdate": s_date, "edate": e_date, "status": new_status, "cat": c_at, "uat": u_at}
                        )

            # PostgreSQL exclusion constraint setup
            if sync_conn.dialect.name == "postgresql" and "allocation_shifts" in table_names:
                sync_conn.execute(text("CREATE EXTENSION IF NOT EXISTS btree_gist;"))
                sync_conn.execute(text("""
                    DO $$
                    BEGIN
                        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_no_double_booking') THEN
                            ALTER TABLE allocation_shifts ADD CONSTRAINT uq_no_double_booking 
                            EXCLUDE USING gist (
                                tenant_id WITH =, 
                                seat_id WITH =, 
                                shift_id WITH =, 
                                daterange(start_date, end_date, '[]') WITH &&
                            ) WHERE (status IN ('active', 'overdue'));
                        END IF;
                    END $$;
                """))


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
