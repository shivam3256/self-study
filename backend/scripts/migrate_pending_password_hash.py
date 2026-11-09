"""
Explicit Migration Script: Add pending_password_hash column
Applies nullable VARCHAR(255) column to 'users' and 'email_otps' tables without backfill.
Supports both SQLite and PostgreSQL.

Usage:
    cd backend
    python scripts/migrate_pending_password_hash.py
"""
import asyncio
import sys
from pathlib import Path

# Add backend root to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import inspect, text
from app.core.database import engine, Base
import app.models  # ensure models are registered


async def run_migration():
    print("Starting migration: adding pending_password_hash to users and email_otps...")
    async with engine.begin() as conn:
        def sync_migrate(sync_conn):
            inspector = inspect(sync_conn)
            table_names = inspector.get_table_names()
            dialect = sync_conn.dialect.name
            print(f"Connected database dialect: {dialect}")

            # 1. users table
            if "users" in table_names:
                user_cols = [c["name"] for c in inspector.get_columns("users")]
                if "pending_password_hash" not in user_cols:
                    print("Adding 'pending_password_hash' column to 'users' table...")
                    sync_conn.execute(text("ALTER TABLE users ADD COLUMN pending_password_hash VARCHAR(255)"))
                    print("Successfully added 'pending_password_hash' to 'users'.")
                else:
                    print("'pending_password_hash' column already exists on 'users'.")
            else:
                print("'users' table not found, will be created on Base.metadata.create_all.")

            # 2. email_otps table
            if "email_otps" in table_names:
                otp_cols = [c["name"] for c in inspector.get_columns("email_otps")]
                if "pending_password_hash" not in otp_cols:
                    print("Adding 'pending_password_hash' column to 'email_otps' table...")
                    sync_conn.execute(text("ALTER TABLE email_otps ADD COLUMN pending_password_hash VARCHAR(255)"))
                    print("Successfully added 'pending_password_hash' to 'email_otps'.")
                else:
                    print("'pending_password_hash' column already exists on 'email_otps'.")
            else:
                print("'email_otps' table not found, will be created on Base.metadata.create_all.")

        await conn.run_sync(sync_migrate)
    print("Migration completed successfully.")


if __name__ == "__main__":
    asyncio.run(run_migration())

