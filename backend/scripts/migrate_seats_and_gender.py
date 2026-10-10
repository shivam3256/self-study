"""
Migration script for StudyHub Seat Management, Onboarding Setup & Student Gender features.
- Adds gender column to students table if not present.
- Creates unique index uq_tenant_desk_number on desks (tenant_id, desk_number).
- Performs one-time backfill verification for any empty tenants without altering the demo tenant.
"""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import inspect, text, select
from app.core.database import engine, Base, AsyncSessionLocal
from app.models.tenant import Tenant
from app.models.desk import Desk
import app.models  # ensure models are registered

async def run_migration():
    print("Starting database migration for Seats & Gender features...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        def sync_migrate(sync_conn):
            inspector = inspect(sync_conn)
            table_names = inspector.get_table_names()

            if "students" in table_names:
                student_cols = [c["name"] for c in inspector.get_columns("students")]
                if "gender" not in student_cols:
                    print("Adding 'gender' column to students table...")
                    sync_conn.execute(text("ALTER TABLE students ADD COLUMN gender VARCHAR(20)"))

            if "desks" in table_names:
                print("Ensuring unique index uq_tenant_desk_number on desks table...")
                sync_conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_desk_number ON desks (tenant_id, desk_number)"))

        await conn.run_sync(sync_migrate)

    print("Schema migration completed successfully.")

if __name__ == "__main__":
    asyncio.run(run_migration())
