"""
Migration script for StudyHub Email OTP Verification feature.
- Adds email_verified, email_verified_at, and pending onboarding columns to users table.
- Creates email_otps table.
- Grandfathers all existing users with email_verified = True.
"""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import inspect, text
from app.core.database import engine, Base
import app.models  # ensure models are registered

async def run_migration():
    print("Starting database migration for StudyHub Email OTP...")
    async with engine.begin() as conn:
        # Create all new tables (such as email_otps)
        await conn.run_sync(Base.metadata.create_all)

        def sync_migrate(sync_conn):
            inspector = inspect(sync_conn)
            table_names = inspector.get_table_names()

            if "users" in table_names:
                # Check if tenant_id is NOT NULL in sqlite
                user_info = sync_conn.execute(text("PRAGMA table_info(users)")).fetchall()
                # pragma table_info columns: (cid, name, type, notnull, dflt_value, pk)
                cols_dict = {col[1]: col for col in user_info}

                tenant_id_col = cols_dict.get("tenant_id")
                # If tenant_id is notnull (col[3] == 1), recreate table to allow NULL tenant_id
                if tenant_id_col and tenant_id_col[3] == 1:
                    print("Making 'tenant_id' nullable in users table...")
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
                    
                    # Copy existing columns
                    existing_cols_in_table = [c[1] for c in user_info]
                    select_fields = []
                    for f in ["id", "created_at", "updated_at", "tenant_id", "full_name", "email", "hashed_password", "role", "is_active", "last_login_at"]:
                        if f in existing_cols_in_table:
                            select_fields.append(f)
                        else:
                            select_fields.append(f"NULL as {f}")
                    
                    sync_conn.execute(text(f"""
                        INSERT INTO users_temp (id, created_at, updated_at, tenant_id, full_name, email, hashed_password, role, is_active, last_login_at, email_verified, email_verified_at)
                        SELECT id, created_at, updated_at, tenant_id, full_name, email, hashed_password, role, is_active, last_login_at, 1, CURRENT_TIMESTAMP
                        FROM users
                    """))
                    sync_conn.execute(text("DROP TABLE users"))
                    sync_conn.execute(text("ALTER TABLE users_temp RENAME TO users"))
                    sync_conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_tenant_id ON users (tenant_id)"))
                    sync_conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_email ON users (email)"))
                    sync_conn.execute(text("PRAGMA foreign_keys = ON"))
                    print("Users table successfully migrated to support pending registrations.")
                else:
                    user_cols = [c[1] for c in user_info]
                    if "email_verified" not in user_cols:
                        print("Adding 'email_verified' column to users...")
                        sync_conn.execute(text("ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT 0"))
                        sync_conn.execute(text("UPDATE users SET email_verified = 1 WHERE email_verified IS NULL OR email_verified = 0"))
                    if "email_verified_at" not in user_cols:
                        sync_conn.execute(text("ALTER TABLE users ADD COLUMN email_verified_at DATETIME"))
                        sync_conn.execute(text("UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE email_verified = 1 AND email_verified_at IS NULL"))

                    pending_fields = [
                        ("pending_library_name", "VARCHAR(255)"),
                        ("pending_phone", "VARCHAR(50)"),
                        ("pending_city", "VARCHAR(100)"),
                        ("pending_address", "TEXT"),
                        ("pending_state", "VARCHAR(100)"),
                        ("pending_pincode", "VARCHAR(20)"),
                        ("pending_additional_email", "VARCHAR(255)"),
                    ]
                    for col_name, col_type in pending_fields:
                        if col_name not in user_cols:
                            sync_conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}"))

        await conn.run_sync(sync_migrate)
    print("Migration completed successfully! All existing users have been safely grandfathered.")

if __name__ == "__main__":
    asyncio.run(run_migration())
