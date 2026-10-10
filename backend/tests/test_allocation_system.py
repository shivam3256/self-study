import pytest
import pytest_asyncio
from datetime import date, timedelta
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from app.main import app
from app.core.database import AsyncSessionLocal
from app.models.tenant import Tenant, User
from app.models.desk import Desk
from app.models.shift import Shift
from app.models.plan import Plan, PlanShift
from app.models.student import Student
from app.models.allocation import Allocation, AllocationShift
from app.services.allocation_service import AllocationService
from app.schemas.allocation import AllocationCreate, RenewalRequest


async def get_or_create_test_student(db, tenant_id: str, suffix: str) -> Student:
    adm = f"ADM-TEST-{suffix}"
    stu = (await db.execute(select(Student).where(Student.tenant_id == tenant_id, Student.admission_number == adm))).scalar_one_or_none()
    if not stu:
        stu = Student(
            tenant_id=tenant_id,
            admission_number=adm,
            full_name=f"Test Student {suffix}",
            phone=f"988877{suffix.replace('-', '')[:4].zfill(4)}",
            status="active",
            join_date=date.today(),
            expiry_date=date.today() + timedelta(days=60)
        )
        db.add(stu)
        await db.commit()
        await db.refresh(stu)
    return stu


@pytest_asyncio.fixture
async def auth_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        login_resp = await ac.post("/api/v1/auth/login", json={
            "email": "owner@apexlibrary.com",
            "password": "admin123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        token = login_resp.json()["access_token"]
        ac.headers.update({"Authorization": f"Bearer {token}"})
        yield ac


@pytest.mark.asyncio
async def test_availability_across_partially_overlapping_shifts(auth_client: AsyncClient):
    """
    Morning student on Seat S:
    - S is NOT available for Morning plan
    - S IS available for Evening plan
    - S is NOT available for Full-day plan (since Full-day requires Morning)
    """
    async with AsyncSessionLocal() as db:
        tenant = (await db.execute(select(Tenant).where(Tenant.slug == "apex-reading-lounge"))).scalar_one()
        tenant_id = tenant.id

        # Fetch shifts
        morn_shift = (await db.execute(select(Shift).where(Shift.tenant_id == tenant_id, Shift.code == "MORN"))).scalar_one()
        eve_shift = (await db.execute(select(Shift).where(Shift.tenant_id == tenant_id, Shift.code == "EVE"))).scalar_one()
        full_shift = (await db.execute(select(Shift).where(Shift.tenant_id == tenant_id, Shift.code == "FULL"))).scalar_one()

        # Find or create a dedicated desk for this test
        desk = (await db.execute(select(Desk).where(Desk.tenant_id == tenant_id, Desk.desk_number == "T-101"))).scalar_one_or_none()
        if not desk:
            desk = Desk(tenant_id=tenant_id, desk_number="T-101", is_active=True)
            db.add(desk)
            await db.commit()
            await db.refresh(desk)

        # Clear any existing allocations on this test desk
        existing = (await db.execute(select(Allocation).where(Allocation.tenant_id == tenant_id, Allocation.seat_id == desk.id))).scalars().all()
        for ex in existing:
            await db.delete(ex)
        await db.commit()

        # Dedicated test student
        student1 = await get_or_create_test_student(db, tenant_id, "PARTIAL-1")

        # Allocate student1 to Morning shift on desk T-101
        today = date.today()
        end_date = today + timedelta(days=30)
        alloc1 = await AllocationService.allocate_seat(
            db=db,
            tenant_id=tenant_id,
            data=AllocationCreate(
                student_id=student1.id,
                seat_id=desk.id,
                shift_ids=[morn_shift.id],
                start_date=today,
                end_date=end_date,
            ),
            auto_commit=True
        )
        assert alloc1.status == "active"

    # Query available seats via API
    # 1. Available for Morning shift
    resp_morn = await auth_client.get(f"/api/v1/seats/available?shift_id={morn_shift.id}&start_date={today.isoformat()}&end_date={end_date.isoformat()}")
    assert resp_morn.status_code == 200
    morn_avail_ids = [s["id"] for s in resp_morn.json()]
    assert desk.id not in morn_avail_ids, "Seat T-101 should NOT be available for Morning shift"

    # 2. Available for Evening shift
    resp_eve = await auth_client.get(f"/api/v1/seats/available?shift_id={eve_shift.id}&start_date={today.isoformat()}&end_date={end_date.isoformat()}")
    assert resp_eve.status_code == 200
    eve_avail_ids = [s["id"] for s in resp_eve.json()]
    assert desk.id in eve_avail_ids, "Seat T-101 SHOULD be available for Evening shift"

    # 3. Available for Full-day shift (should NOT be available because Morning is occupied)
    resp_full = await auth_client.get(f"/api/v1/seats/available?shift_id={full_shift.id}&start_date={today.isoformat()}&end_date={end_date.isoformat()}")
    assert resp_full.status_code == 200
    full_avail_ids = [s["id"] for s in resp_full.json()]
    assert desk.id not in full_avail_ids, "Seat T-101 should NOT be available for Full-day shift"


@pytest.mark.asyncio
async def test_concurrent_double_booking_conflict(auth_client: AsyncClient):
    """
    Attempting to allocate the same seat for conflicting shifts/dates raises 409 Conflict.
    """
    async with AsyncSessionLocal() as db:
        tenant = (await db.execute(select(Tenant).where(Tenant.slug == "apex-reading-lounge"))).scalar_one()
        tenant_id = tenant.id

        morn_shift = (await db.execute(select(Shift).where(Shift.tenant_id == tenant_id, Shift.code == "MORN"))).scalar_one()
        desk = (await db.execute(select(Desk).where(Desk.tenant_id == tenant_id, Desk.desk_number == "T-102"))).scalar_one_or_none()
        if not desk:
            desk = Desk(tenant_id=tenant_id, desk_number="T-102", is_active=True)
            db.add(desk)
            await db.commit()
            await db.refresh(desk)

        # Clear existing on test desk
        existing = (await db.execute(select(Allocation).where(Allocation.tenant_id == tenant_id, Allocation.seat_id == desk.id))).scalars().all()
        for ex in existing:
            await db.delete(ex)
        await db.commit()

        s1 = await get_or_create_test_student(db, tenant_id, "CONCURRENT-1")
        s2 = await get_or_create_test_student(db, tenant_id, "CONCURRENT-2")

    today = date.today()
    # First allocation succeeds
    resp1 = await auth_client.post("/api/v1/allocations", json={
        "student_id": s1.id,
        "seat_id": desk.id,
        "shift_ids": [morn_shift.id],
        "start_date": today.isoformat(),
        "end_date": (today + timedelta(days=30)).isoformat()
    })
    assert resp1.status_code == 201

    # Second allocation on the same seat and shift overlaps -> must return 409 Conflict
    resp2 = await auth_client.post("/api/v1/allocations", json={
        "student_id": s2.id,
        "seat_id": desk.id,
        "shift_ids": [morn_shift.id],
        "start_date": today.isoformat(),
        "end_date": (today + timedelta(days=30)).isoformat()
    })
    assert resp2.status_code == 409
    assert "already occupied" in resp2.json()["detail"].lower() or "conflict" in resp2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_renewal_extension(auth_client: AsyncClient):
    """
    Renewal extends end_date without changing seat/shifts, and verifies conflict prevention.
    """
    async with AsyncSessionLocal() as db:
        tenant = (await db.execute(select(Tenant).where(Tenant.slug == "apex-reading-lounge"))).scalar_one()
        tenant_id = tenant.id

        morn_shift = (await db.execute(select(Shift).where(Shift.tenant_id == tenant_id, Shift.code == "MORN"))).scalar_one()
        desk = (await db.execute(select(Desk).where(Desk.tenant_id == tenant_id, Desk.desk_number == "T-103"))).scalar_one_or_none()
        if not desk:
            desk = Desk(tenant_id=tenant_id, desk_number="T-103", is_active=True)
            db.add(desk)
            await db.commit()
            await db.refresh(desk)

        # Clear existing on test desk
        existing = (await db.execute(select(Allocation).where(Allocation.tenant_id == tenant_id, Allocation.seat_id == desk.id))).scalars().all()
        for ex in existing:
            await db.delete(ex)
        await db.commit()

        student = await get_or_create_test_student(db, tenant_id, "RENEWAL-1")

    today = date.today()
    initial_end = today + timedelta(days=30)
    # Create initial allocation
    resp = await auth_client.post("/api/v1/allocations", json={
        "student_id": student.id,
        "seat_id": desk.id,
        "shift_ids": [morn_shift.id],
        "start_date": today.isoformat(),
        "end_date": initial_end.isoformat()
    })
    assert resp.status_code == 201
    alloc_id = resp.json()["id"]

    # Renew by extending 30 days
    renew_resp = await auth_client.post(f"/api/v1/allocations/{alloc_id}/renew", json={
        "duration_days": 30
    })
    assert renew_resp.status_code == 200
    renew_data = renew_resp.json()
    expected_new_end = (initial_end + timedelta(days=30)).isoformat()
    assert renew_data["end_date"] == expected_new_end
    assert renew_data["seat_id"] == desk.id


@pytest.mark.asyncio
async def test_overdue_and_expiry_lifecycle_and_seat_release():
    """
    Lifecycle transitions:
    - Active allocation past end_date becomes overdue (seat NOT freed during grace period).
    - Past grace period (end_date + grace_period_days), allocation becomes expired and seat IS freed.
    """
    async with AsyncSessionLocal() as db:
        tenant = (await db.execute(select(Tenant).where(Tenant.slug == "apex-reading-lounge"))).scalar_one()
        tenant_id = tenant.id
        grace_days = tenant.grace_period_days or 5

        morn_shift = (await db.execute(select(Shift).where(Shift.tenant_id == tenant_id, Shift.code == "MORN"))).scalar_one()
        desk = (await db.execute(select(Desk).where(Desk.tenant_id == tenant_id, Desk.desk_number == "T-104"))).scalar_one_or_none()
        if not desk:
            desk = Desk(tenant_id=tenant_id, desk_number="T-104", is_active=True)
            db.add(desk)
            await db.commit()
            await db.refresh(desk)

        # Clear existing on test desk
        existing = (await db.execute(select(Allocation).where(Allocation.tenant_id == tenant_id, Allocation.seat_id == desk.id))).scalars().all()
        for ex in existing:
            await db.delete(ex)
        await db.commit()

        student = await get_or_create_test_student(db, tenant_id, "LIFECYCLE-1")

        # 1. Create allocation that ended 2 days ago (within grace period)
        today = date.today()
        ended_2_days_ago = today - timedelta(days=2)
        start_date = ended_2_days_ago - timedelta(days=30)
        alloc_overdue = await AllocationService.allocate_seat(
            db=db,
            tenant_id=tenant_id,
            data=AllocationCreate(
                student_id=student.id,
                seat_id=desk.id,
                shift_ids=[morn_shift.id],
                start_date=start_date,
                end_date=ended_2_days_ago,
            ),
            auto_commit=True
        )

        # Run lifecycle job
        summary = await AllocationService.process_overdue_and_expirations(db)
        await db.refresh(alloc_overdue)
        assert alloc_overdue.status == "overdue"

        # Check seat availability: should NOT be free because it is overdue (within grace period)
        is_free_overdue = await AllocationService.check_seat_availability(
            db=db,
            tenant_id=tenant_id,
            seat_id=desk.id,
            shift_ids=[morn_shift.id],
            start_date=today,
            end_date=today + timedelta(days=30),
            raise_on_conflict=False
        )
        assert is_free_overdue is False, "Seat should remain occupied while in overdue grace period"

        # 2. Change end_date to ended beyond grace period (e.g. ended grace_days + 2 days ago)
        ended_beyond_grace = today - timedelta(days=grace_days + 2)
        alloc_overdue.end_date = ended_beyond_grace
        for ashift in alloc_overdue.allocation_shifts:
            ashift.end_date = ended_beyond_grace
        await db.commit()

        # Run lifecycle job again
        summary2 = await AllocationService.process_overdue_and_expirations(db)
        await db.refresh(alloc_overdue)
        assert alloc_overdue.status == "expired"

        # Check seat availability: seat SHOULD NOW be free because allocation is expired!
        is_free_expired = await AllocationService.check_seat_availability(
            db=db,
            tenant_id=tenant_id,
            seat_id=desk.id,
            shift_ids=[morn_shift.id],
            start_date=today,
            end_date=today + timedelta(days=30),
            raise_on_conflict=False
        )
        assert is_free_expired is True, "Seat must be released after grace period expires"


@pytest.mark.asyncio
async def test_plan_edit_not_affecting_existing_allocations(auth_client: AsyncClient):
    """
    Editing a plan's shifts must snapshot-protect existing allocations.
    """
    async with AsyncSessionLocal() as db:
        tenant = (await db.execute(select(Tenant).where(Tenant.slug == "apex-reading-lounge"))).scalar_one()
        tenant_id = tenant.id

        morn_shift = (await db.execute(select(Shift).where(Shift.tenant_id == tenant_id, Shift.code == "MORN"))).scalar_one()
        eve_shift = (await db.execute(select(Shift).where(Shift.tenant_id == tenant_id, Shift.code == "EVE"))).scalar_one()

        # Create a new test plan with Morning shift
        plan = Plan(
            tenant_id=tenant_id,
            name="Snapshot Test Plan",
            code="SNAPSHOT_PLAN",
            duration_days=30,
            price=1000.0,
            is_active=True
        )
        db.add(plan)
        await db.flush()
        db.add(PlanShift(tenant_id=tenant_id, plan_id=plan.id, shift_id=morn_shift.id))
        await db.commit()
        await db.refresh(plan)

        desk = (await db.execute(select(Desk).where(Desk.tenant_id == tenant_id, Desk.desk_number == "T-105"))).scalar_one_or_none()
        if not desk:
            desk = Desk(tenant_id=tenant_id, desk_number="T-105", is_active=True)
            db.add(desk)
            await db.commit()
            await db.refresh(desk)

        # Clear existing on test desk
        existing = (await db.execute(select(Allocation).where(Allocation.tenant_id == tenant_id, Allocation.seat_id == desk.id))).scalars().all()
        for ex in existing:
            await db.delete(ex)
        await db.commit()

        student = await get_or_create_test_student(db, tenant_id, "SNAPSHOT-1")

    today = date.today()
    # 1. Allocate student under this plan (shifts are snapshotted from plan -> morning)
    create_resp = await auth_client.post("/api/v1/allocations", json={
        "student_id": student.id,
        "plan_id": plan.id,
        "seat_id": desk.id,
        "start_date": today.isoformat(),
        "end_date": (today + timedelta(days=30)).isoformat()
    })
    assert create_resp.status_code == 201
    alloc_id = create_resp.json()["id"]

    # 2. Update the plan to now include Evening shift instead of Morning
    update_plan_resp = await auth_client.put(f"/api/v1/plans/{plan.id}", json={
        "name": "Updated Snapshot Test Plan",
        "duration_days": 30,
        "price": 1200.0,
        "shift_ids": [eve_shift.id]
    })
    assert update_plan_resp.status_code == 200

    # 3. Verify the existing allocation still has Morning shift in allocation_shifts
    async with AsyncSessionLocal() as db:
        alloc_res = await db.execute(
            select(Allocation)
            .options(selectinload(Allocation.allocation_shifts))
            .where(Allocation.id == alloc_id)
        )
        alloc = alloc_res.scalar_one()
        alloc_shift_ids = [s.shift_id for s in alloc.allocation_shifts]
        assert morn_shift.id in alloc_shift_ids, "Existing allocation must retain its snapshotted Morning shift"
        assert eve_shift.id not in alloc_shift_ids, "Existing allocation must NOT adopt the newly modified plan shifts"


@pytest.mark.asyncio
async def test_tenant_isolation(auth_client: AsyncClient):
    """
    Allocations in Tenant A must not conflict or be accessible in Tenant B.
    """
    async with AsyncSessionLocal() as db:
        # Create second tenant
        t2 = (await db.execute(select(Tenant).where(Tenant.email == "tenant2@test.com"))).scalar_one_or_none()
        if not t2:
            t2 = Tenant(
                name="Tenant 2 Library",
                slug="tenant-2-library",
                email="tenant2@test.com",
            )
            db.add(t2)
            await db.flush()
            t2_shift = Shift(
                tenant_id=t2.id,
                name="T2 Morning",
                code="MORN",
                start_time="08:00",
                end_time="14:00",
                capacity=10
            )
            t2_desk = Desk(
                tenant_id=t2.id,
                desk_number="T-101", # Same desk number as tenant 1!
                is_active=True
            )
            t2_student = Student(
                tenant_id=t2.id,
                admission_number="ADM-T2-01",
                full_name="Tenant 2 Student",
                phone="9998887776"
            )
            db.add_all([t2_shift, t2_desk, t2_student])
            await db.commit()
            await db.refresh(t2_shift)
            await db.refresh(t2_desk)
            await db.refresh(t2_student)
        else:
            t2_shift = (await db.execute(select(Shift).where(Shift.tenant_id == t2.id))).scalar_one()
            t2_desk = (await db.execute(select(Desk).where(Desk.tenant_id == t2.id))).scalar_one()
            t2_student = (await db.execute(select(Student).where(Student.tenant_id == t2.id))).scalar_one()

        # Clear existing allocations in tenant 2
        existing_t2 = (await db.execute(select(Allocation).where(Allocation.tenant_id == t2.id))).scalars().all()
        for ex in existing_t2:
            await db.delete(ex)
        await db.commit()

        # Allocate in tenant 2
        today = date.today()
        alloc_t2 = await AllocationService.allocate_seat(
            db=db,
            tenant_id=t2.id,
            data=AllocationCreate(
                student_id=t2_student.id,
                seat_id=t2_desk.id,
                shift_ids=[t2_shift.id],
                start_date=today,
                end_date=today + timedelta(days=30)
            ),
            auto_commit=True
        )
        assert alloc_t2.tenant_id == t2.id

    # Tenant 1 user attempts to get Tenant 2's allocation -> must be 404
    resp = await auth_client.get(f"/api/v1/allocations/{alloc_t2.id}")
    assert resp.status_code == 404
