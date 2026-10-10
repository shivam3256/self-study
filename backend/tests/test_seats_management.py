import pytest
from datetime import date, timedelta
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.core.database import AsyncSessionLocal
from app.models.tenant import Tenant, User
from app.models.desk import Desk
from app.models.shift import Shift
from app.models.student import Student
from app.models.allocation import SeatAllocation
from app.core.security import get_password_hash


import secrets

async def create_test_tenant(db, name: str, base_slug: str, base_email: str):
    uid = secrets.token_hex(4)
    slug = f"{base_slug}-{uid}"
    email = f"{uid}_{base_email}"
    tenant = Tenant(
        name=name,
        slug=slug,
        owner_name="Test Owner",
        email=email,
        phone="+91 99999 88888",
        subscription_tier="pro",
        subscription_status="active"
    )
    db.add(tenant)
    await db.flush()

    user = User(
        tenant_id=tenant.id,
        full_name="Test User",
        email=email,
        hashed_password=get_password_hash("password123"),
        role="owner",
        is_active=True,
        email_verified=True
    )
    db.add(user)

    morn = Shift(tenant_id=tenant.id, name="Morning Shift", code="MORN", start_time="06:00", end_time="14:00", capacity=40)
    eve = Shift(tenant_id=tenant.id, name="Evening Shift", code="EVE", start_time="14:00", end_time="22:00", capacity=40)
    full = Shift(tenant_id=tenant.id, name="Full Day", code="FULL", start_time="06:00", end_time="23:00", capacity=40)
    db.add_all([morn, eve, full])
    await db.commit()
    await db.refresh(tenant)
    await db.refresh(user)
    return tenant, user



@pytest.mark.asyncio
async def test_onboarding_seats_setup_and_idempotency():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        async with AsyncSessionLocal() as db:
            tenant, user = await create_test_tenant(db, "Onboarding Library", "onboarding-lib", "onboard@test.com")

        login_resp = await ac.post("/api/v1/auth/login", json={"email": user.email, "password": "password123"})
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Onboarding setup: Floor A (20 seats) + Floor B (10 seats) = 30 seats
        setup_payload = {
            "floors": [
                {"name": "Floor A", "seat_count": 20},
                {"name": "Floor B", "seat_count": 10}
            ]
        }
        res = await ac.post("/api/v1/desks/onboarding-setup", json=setup_payload, headers=headers)
        assert res.status_code == 201
        data = res.json()
        assert data["success"] is True
        assert data["total_seats_created"] == 30
        assert data["total_floors"] == 2
        assert len(data["desks"]) == 30

        # Verify seat codes
        desk_numbers = [d["desk_number"] for d in data["desks"]]
        assert "A-01" in desk_numbers
        assert "A-20" in desk_numbers
        assert "B-01" in desk_numbers
        assert "B-10" in desk_numbers

        # 2. Idempotency test: calling again with same config must not create duplicate seats
        res2 = await ac.post("/api/v1/desks/onboarding-setup", json=setup_payload, headers=headers)
        assert res2.status_code == 201
        data2 = res2.json()
        assert data2["total_seats_created"] == 0
        assert len(data2["desks"]) == 30


@pytest.mark.asyncio
async def test_seat_uniqueness_and_bulk_add():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        async with AsyncSessionLocal() as db:
            tenant, user = await create_test_tenant(db, "Unique Library", "unique-lib", "unique@test.com")

        login_resp = await ac.post("/api/v1/auth/login", json={"email": user.email, "password": "password123"})
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create single desk
        c_res = await ac.post("/api/v1/desks", json={"desk_number": "D-01", "zone": "Floor D", "category": "general"}, headers=headers)
        assert c_res.status_code == 201

        # Attempt to create duplicate desk
        dup_res = await ac.post("/api/v1/desks", json={"desk_number": "D-01", "zone": "Floor D", "category": "general"}, headers=headers)
        assert dup_res.status_code == 409

        # Bulk add 5 more seats to Floor D -> should produce D-02, D-03, D-04, D-05, D-06
        bulk_res = await ac.post("/api/v1/desks/bulk-add", json={"zone": "Floor D", "count": 5, "category": "ac"}, headers=headers)
        assert bulk_res.status_code == 201
        b_data = bulk_res.json()
        assert len(b_data) == 5
        bulk_nums = [d["desk_number"] for d in b_data]
        assert bulk_nums == ["D-02", "D-03", "D-04", "D-05", "D-06"]


@pytest.mark.asyncio
async def test_delete_rules_for_occupied_seats_and_zones():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        async with AsyncSessionLocal() as db:
            tenant, user = await create_test_tenant(db, "Delete Rules Library", "delete-rules-lib", "delrules@test.com")
            # Create desk
            desk = Desk(tenant_id=tenant.id, desk_number="Z-01", zone="Zone Z", category="general", is_active=True)
            free_desk = Desk(tenant_id=tenant.id, desk_number="Z-02", zone="Zone Z", category="general", is_active=True)
            db.add_all([desk, free_desk])
            await db.flush()

            # Create student & allocation
            student = Student(tenant_id=tenant.id, admission_number="ADM-DEL1", full_name="Occupant Student", phone="+91 9988776655")
            db.add(student)
            await db.flush()

            shifts_res = await db.execute(select(Shift).where(Shift.tenant_id == tenant.id))
            shift = shifts_res.scalars().first()

            alloc = SeatAllocation(
                tenant_id=tenant.id,
                student_id=student.id,
                desk_id=desk.id,
                shift_id=shift.id,
                start_date=date.today(),
                end_date=date.today() + timedelta(days=30),
                status="active"
            )
            db.add(alloc)
            await db.commit()
            desk_id = desk.id
            free_desk_id = free_desk.id

        login_resp = await ac.post("/api/v1/auth/login", json={"email": user.email, "password": "password123"})
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Attempt to delete occupied desk Z-01 -> MUST FAIL with 409
        del_res = await ac.delete(f"/api/v1/desks/{desk_id}", headers=headers)
        assert del_res.status_code == 409
        assert "Occupant Student" in del_res.json()["detail"]

        # 2. Attempt to delete zone with occupied seat -> MUST FAIL with 409
        del_zone_res = await ac.delete("/api/v1/desks/zones?name=Zone%20Z", headers=headers)
        assert del_zone_res.status_code == 409

        # 3. Delete free desk Z-02 -> SUCCEEDS with 204
        del_free_res = await ac.delete(f"/api/v1/desks/{free_desk_id}", headers=headers)
        assert del_free_res.status_code == 204


@pytest.mark.asyncio
async def test_shift_overlap_conflicts_and_ladies_only():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        async with AsyncSessionLocal() as db:
            tenant, user = await create_test_tenant(db, "Overlap Library", "overlap-lib", "overlap@test.com")
            
            # Create a regular desk and a ladies_only desk
            reg_desk = Desk(tenant_id=tenant.id, desk_number="O-01", zone="Floor O", category="general", is_active=True)
            ladies_desk = Desk(tenant_id=tenant.id, desk_number="L-01", zone="Floor L", category="ladies_only", is_active=True)
            db.add_all([reg_desk, ladies_desk])
            
            # Create Male and Female students
            male_student = Student(tenant_id=tenant.id, admission_number="ADM-M1", full_name="Rohan Male", gender="male", phone="+91 9111111111")
            female_student = Student(tenant_id=tenant.id, admission_number="ADM-F1", full_name="Priya Female", gender="female", phone="+91 9222222222")
            db.add_all([male_student, female_student])
            await db.commit()

            shifts_res = await db.execute(select(Shift).where(Shift.tenant_id == tenant.id))
            shifts = {s.code: s for s in shifts_res.scalars().all()}
            morn_shift = shifts["MORN"]
            eve_shift = shifts["EVE"]
            full_shift = shifts["FULL"]
            
            male_id = male_student.id
            female_id = female_student.id
            reg_desk_id = reg_desk.id
            ladies_desk_id = ladies_desk.id

        login_resp = await ac.post("/api/v1/auth/login", json={"email": user.email, "password": "password123"})
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Ladies Only Rule: Male cannot book LADIES_ONLY desk
        lad_male_res = await ac.post("/api/v1/allocations", json={
            "student_id": male_id,
            "desk_id": ladies_desk_id,
            "shift_id": morn_shift.id,
            "start_date": date.today().isoformat(),
            "end_date": (date.today() + timedelta(days=30)).isoformat()
        }, headers=headers)
        assert lad_male_res.status_code == 400
        assert "LADIES_ONLY" in lad_male_res.json()["detail"]

        # Female CAN book LADIES_ONLY desk
        lad_fem_res = await ac.post("/api/v1/allocations", json={
            "student_id": female_id,
            "desk_id": ladies_desk_id,
            "shift_id": morn_shift.id,
            "start_date": date.today().isoformat(),
            "end_date": (date.today() + timedelta(days=30)).isoformat()
        }, headers=headers)
        assert lad_fem_res.status_code == 201

        # 2. Shift Coexistence: Morning and Evening can coexist on reg_desk O-01
        morn_res = await ac.post("/api/v1/allocations", json={
            "student_id": male_id,
            "desk_id": reg_desk_id,
            "shift_id": morn_shift.id,
            "start_date": date.today().isoformat(),
            "end_date": (date.today() + timedelta(days=30)).isoformat()
        }, headers=headers)
        assert morn_res.status_code == 201

        # 3. Conflict Rule: Full Day conflicts with already booked Morning/Evening
        full_res = await ac.post("/api/v1/allocations", json={
            "student_id": female_id,
            "desk_id": reg_desk_id,
            "shift_id": full_shift.id,
            "start_date": date.today().isoformat(),
            "end_date": (date.today() + timedelta(days=30)).isoformat()
        }, headers=headers)
        assert full_res.status_code == 409

        # Evening coexists with Morning on reg_desk O-01
        eve_res = await ac.post("/api/v1/allocations", json={
            "student_id": female_id,
            "desk_id": reg_desk_id,
            "shift_id": eve_shift.id,
            "start_date": date.today().isoformat(),
            "end_date": (date.today() + timedelta(days=30)).isoformat()
        }, headers=headers)
        assert eve_res.status_code == 201

        # 4. Seat Map Occupancy Check:
        # For Full Day shift, O-01 MUST show as occupied because it has active shift bookings!
        full_map_res = await ac.get(f"/api/v1/desks/seat-map?shift_id={full_shift.id}", headers=headers)
        assert full_map_res.status_code == 200
        full_map = full_map_res.json()
        o01_full = next(d for d in full_map if d["desk_number"] == "O-01")
        assert o01_full["is_occupied"] is True
        assert "Rohan Male" in o01_full["student_name"] or "Priya Female" in o01_full["student_name"]


@pytest.mark.asyncio
async def test_tenant_isolation_for_seats():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        async with AsyncSessionLocal() as db:
            tenant_a, user_a = await create_test_tenant(db, "Tenant Alpha", "tenant-alpha", "alpha@test.com")
            tenant_b, user_b = await create_test_tenant(db, "Tenant Beta", "tenant-beta", "beta@test.com")

            # Tenant A creates desk A-99
            desk_a = Desk(tenant_id=tenant_a.id, desk_number="A-99", zone="Alpha Zone", category="general", is_active=True)
            db.add(desk_a)
            await db.commit()
            desk_a_id = desk_a.id

        # Login as Tenant B
        login_b = await ac.post("/api/v1/auth/login", json={"email": user_b.email, "password": "password123"})
        token_b = login_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # Tenant B lists desks -> must NOT contain A-99
        list_b = await ac.get("/api/v1/desks", headers=headers_b)
        assert list_b.status_code == 200
        b_desk_numbers = [d["desk_number"] for d in list_b.json()]
        assert "A-99" not in b_desk_numbers

        # Tenant B attempts to update Tenant A's desk -> 404
        upd_b = await ac.put(f"/api/v1/desks/{desk_a_id}", json={"desk_number": "HACKED-01"}, headers=headers_b)
        assert upd_b.status_code == 404

        # Tenant B attempts to delete Tenant A's desk -> 404
        del_b = await ac.delete(f"/api/v1/desks/{desk_a_id}", headers=headers_b)
        assert del_b.status_code == 404
