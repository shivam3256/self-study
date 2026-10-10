"""
Standalone Database Migration:
1. Adds grace_period_days to tenants.
2. Adds zone_id to plans.
3. Migrates legacy plans to plan_shifts join table.
4. Migrates legacy seat_allocations to allocations + allocation_shifts.
5. Enables btree_gist and adds exclusion constraint on PostgreSQL.
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text, inspect
from app.core.database import engine, Base


async def run_migration():
    print("Starting database migration for allocations and plan_shifts...")
    async with engine.begin() as conn:
        # Create all tables if not exist
        await conn.run_sync(Base.metadata.create_all)

        def do_sync_migrations(sync_conn):
            inspector = inspect(sync_conn)
            table_names = inspector.get_table_names()
            now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

            # 1. Tenant columns
            if "tenants" in table_names:
                tenant_cols = [c["name"] for c in inspector.get_columns("tenants")]
                if "grace_period_days" not in tenant_cols:
                    print("Adding grace_period_days to tenants table...")
                    sync_conn.execute(text("ALTER TABLE tenants ADD COLUMN grace_period_days INTEGER DEFAULT 5"))

            # 2. Plan columns
            if "plans" in table_names:
                plan_cols = [c["name"] for c in inspector.get_columns("plans")]
                if "zone_id" not in plan_cols:
                    print("Adding zone_id to plans table...")
                    sync_conn.execute(text("ALTER TABLE plans ADD COLUMN zone_id VARCHAR(100)"))

            # 3. Migrate plan_shifts
            if "plan_shifts" in table_names and "plans" in table_names and "shifts" in table_names:
                ps_count = sync_conn.execute(text("SELECT COUNT(*) FROM plan_shifts")).scalar()
                if ps_count == 0:
                    print("Migrating legacy plans to plan_shifts join table...")
                    existing_plans = sync_conn.execute(text("SELECT id, tenant_id, shift_type FROM plans")).fetchall()
                    migrated_plans = 0
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
                        migrated_plans += 1
                    print(f"Successfully migrated {migrated_plans} plan(s) to plan_shifts.")

            # 4. Migrate seat_allocations to allocations & allocation_shifts
            if "seat_allocations" in table_names and "allocations" in table_names:
                alloc_count = sync_conn.execute(text("SELECT COUNT(*) FROM allocations")).scalar()
                if alloc_count == 0:
                    print("Migrating legacy seat_allocations to allocations & allocation_shifts...")
                    legacy_allocs = sync_conn.execute(
                        text("SELECT id, tenant_id, student_id, desk_id, shift_id, start_date, end_date, status, created_at, updated_at FROM seat_allocations")
                    ).fetchall()
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
                    print(f"Successfully migrated {len(legacy_allocs)} allocation(s).")

            # 5. PostgreSQL exclusion constraint setup
            if sync_conn.dialect.name == "postgresql" and "allocation_shifts" in table_names:
                print("Setting up PostgreSQL btree_gist extension and exclusion constraint...")
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
                print("PostgreSQL exclusion constraint is configured.")

        await conn.run_sync(do_sync_migrations)
    print("Migration completed successfully.")

if __name__ == "__main__":
    asyncio.run(run_migration())
