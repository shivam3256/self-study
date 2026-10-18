import pytest
from datetime import date, timedelta
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
import secrets

from app.main import app
from app.core.database import AsyncSessionLocal
from app.models.tenant import Tenant, User
from app.models.student import Student
from app.models.plan import Plan
from app.models.locker import Locker, LockerAssignment
from app.models.payment import Payment
from app.core.security import get_password_hash


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
    await db.commit()
    await db.refresh(tenant)
    await db.refresh(user)
    return tenant, user


async def create_test_student(db, tenant_id: str, name: str = "Rahul Sharma"):
    uid = secrets.token_hex(3)
    student = Student(
        tenant_id=tenant_id,
        admission_number=f"ADM-{uid}",
        full_name=name,
        phone=f"+91 98765 {secrets.randbelow(90000) + 10000}",
        email=f"student_{uid}@test.com",
        status="active",
        expiry_date=date.today() + timedelta(days=30),
    )
    db.add(student)
    await db.commit()
    await db.refresh(student)
    return student


async def create_test_plan(db, tenant_id: str):
    plan = Plan(
        tenant_id=tenant_id,
        name="1 Month Study Plan",
        code=f"PLAN-{secrets.token_hex(2)}",
        price=1500.0,
        duration_days=30,
        is_active=True
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


@pytest.mark.asyncio
async def test_locker_crud_and_bulk_create():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        async with AsyncSessionLocal() as db:
            tenant, user = await create_test_tenant(db, "Locker Lib 1", "locker-lib-1", "locker1@test.com")

        login_res = await ac.post("/api/v1/auth/login", json={"email": user.email, "password": "password123"})
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Single create
        res = await ac.post("/api/v1/lockers", json={"label": "L-01", "monthly_fee": 350.0}, headers=headers)
        assert res.status_code == 201
        data = res.json()
        assert data["label"] == "L-01"
        assert float(data["monthly_fee"]) == 350.0
        assert data["status"] == "available"
        single_id = data["id"]

        # Duplicate label in same tenant must fail
        dup_res = await ac.post("/api/v1/lockers", json={"label": "L-01", "monthly_fee": 350.0}, headers=headers)
        assert dup_res.status_code == 409

        # 2. Bulk create (L-02 to L-05)
        bulk_res = await ac.post("/api/v1/lockers/bulk", json={
            "prefix": "L-",
            "start_number": 2,
            "count": 4,
            "monthly_fee": 300.0
        }, headers=headers)
        assert bulk_res.status_code == 201
        bulk_data = bulk_res.json()
        assert len(bulk_data) == 4
        labels = [l["label"] for l in bulk_data]
        assert labels == ["L-2", "L-3", "L-4", "L-5"]

        # 3. Locker Map endpoint
        map_res = await ac.get("/api/v1/lockers/map", headers=headers)
        assert map_res.status_code == 200
        map_data = map_res.json()
        assert map_data["total"] == 5
        lockers_list = map_data["lockers"]
        assert len(lockers_list) == 5
        assert all(item["computed_status"] == "available" for item in lockers_list)


@pytest.mark.asyncio
async def test_locker_assignment_and_double_assign_rejection():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        async with AsyncSessionLocal() as db:
            tenant, user = await create_test_tenant(db, "Locker Lib 2", "locker-lib-2", "locker2@test.com")
            student1 = await create_test_student(db, tenant.id, "Student One")
            student2 = await create_test_student(db, tenant.id, "Student Two")

        login_res = await ac.post("/api/v1/auth/login", json={"email": user.email, "password": "password123"})
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create two lockers
        l1 = (await ac.post("/api/v1/lockers", json={"label": "LK-1", "monthly_fee": 400.0}, headers=headers)).json()
        l2 = (await ac.post("/api/v1/lockers", json={"label": "LK-2", "monthly_fee": 400.0}, headers=headers)).json()

        # 1. Assign Locker 1 to Student 1 with deposit and first payment
        assign_res = await ac.post(f"/api/v1/lockers/{l1['id']}/assign", json={
            "student_id": student1.id,
            "start_date": str(date.today()),
            "monthly_fee": 400.0,
            "deposit_amount": 500.0,
            "collect_payment": True,
            "months": 1,
            "payment_mode": "upi"
        }, headers=headers)
        assert assign_res.status_code == 200
        assign_data = assign_res.json()
        assert assign_data["assignment"]["status"] == "active"
        assert float(assign_data["assignment"]["deposit_amount"]) == 500.0
        assert assign_data["payment_id"] is not None

        # Fetch receipt for upfront payment and verify payment mode
        receipt_res = await ac.get(f"/api/v1/payments/{assign_data['payment_id']}/receipt", headers=headers)
        assert receipt_res.status_code == 200
        receipt_data = receipt_res.json()
        assert receipt_data["payment_mode"] == "upi"

        # Verify map shows assigned
        map_res = await ac.get("/api/v1/lockers/map", headers=headers)
        assigned_l1 = next(item for item in map_res.json()["lockers"] if item["id"] == l1["id"])
        assert assigned_l1["computed_status"] == "assigned"
        assert assigned_l1["student_name"] == student1.full_name

        # 2. Double-assign rejection: Try assigning LK-1 to Student 2
        conflict1 = await ac.post(f"/api/v1/lockers/{l1['id']}/assign", json={
            "student_id": student2.id,
            "start_date": str(date.today()),
            "monthly_fee": 400.0
        }, headers=headers)
        assert conflict1.status_code == 409
        assert "active student assignment" in conflict1.json()["detail"].lower()

        # 3. Double-assign rejection: Try assigning second locker LK-2 to Student 1
        conflict2 = await ac.post(f"/api/v1/lockers/{l2['id']}/assign", json={
            "student_id": student1.id,
            "start_date": str(date.today()),
            "monthly_fee": 400.0
        }, headers=headers)
        assert conflict2.status_code == 409
        assert "already has an active locker" in conflict2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_renewal_date_math():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        async with AsyncSessionLocal() as db:
            tenant, user = await create_test_tenant(db, "Locker Lib 3", "locker-lib-3", "locker3@test.com")
            student = await create_test_student(db, tenant.id, "Amit Kumar")

        login_res = await ac.post("/api/v1/auth/login", json={"email": user.email, "password": "password123"})
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create locker
        l = (await ac.post("/api/v1/lockers", json={"label": "LK-30", "monthly_fee": 300.0}, headers=headers)).json()

        # Assign starting 2026-10-01 without immediate payment
        assign_res = await ac.post(f"/api/v1/lockers/{l['id']}/assign", json={
            "student_id": student.id,
            "start_date": "2026-10-01",
            "monthly_fee": 300.0,
            "collect_payment": False
        }, headers=headers)
        assert assign_res.status_code == 200

        # Now renew for 1 month starting from assignment start date (2026-10-01)
        # Expected paid_until: 2026-10-31 (1 month minus 1 day from 2026-10-01)
        renew1 = await ac.post(f"/api/v1/lockers/{l['id']}/renew", json={
            "months": 1,
            "payment_mode": "cash"
        }, headers=headers)
        assert renew1.status_code == 200
        paid_until_1 = renew1.json()["assignment"]["paid_until"]
        assert paid_until_1 == "2026-10-31"

        # Now renew for 2 more months from 2026-10-31
        # Start of extension is 2026-11-01 -> + 2 months minus 1 day -> 2026-12-31
        renew2 = await ac.post(f"/api/v1/lockers/{l['id']}/renew", json={
            "months": 2,
            "payment_mode": "upi"
        }, headers=headers)
        assert renew2.status_code == 200
        paid_until_2 = renew2.json()["assignment"]["paid_until"]
        assert paid_until_2 == "2026-12-31"


@pytest.mark.asyncio
async def test_combined_payment_creates_two_rows_one_receipt():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        async with AsyncSessionLocal() as db:
            tenant, user = await create_test_tenant(db, "Locker Lib 4", "locker-lib-4", "locker4@test.com")
            student = await create_test_student(db, tenant.id, "Sneha Patel")
            plan = await create_test_plan(db, tenant.id)

        login_res = await ac.post("/api/v1/auth/login", json={"email": user.email, "password": "password123"})
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create and assign locker
        l = (await ac.post("/api/v1/lockers", json={"label": "LK-Combo", "monthly_fee": 250.0}, headers=headers)).json()
        await ac.post(f"/api/v1/lockers/{l['id']}/assign", json={
            "student_id": student.id,
            "start_date": "2026-10-01",
            "monthly_fee": 250.0
        }, headers=headers)

        # Execute Combined Payment: Seat (Plan: 1500, discount: 100) + Locker (250 * 2 mo = 500)
        combined_payload = {
            "student_id": student.id,
            "plan_id": plan.id,
            "period_start": "2026-10-01",
            "period_end": "2026-10-30",
            "locker_months": 2,
            "payment_mode": "upi",
            "reference_number": "UPI-COMBO-999",
            "seat_discount": 100.0,
            "remarks": "Combined renewal test"
        }
        res = await ac.post("/api/v1/lockers/combined-payment", json=combined_payload, headers=headers)
        assert res.status_code == 201 or res.status_code == 200
        receipt = res.json()

        # Check line items and combined total
        assert len(receipt["line_items"]) == 2
        seat_item = next(item for item in receipt["line_items"] if item["item_type"] == "seat")
        locker_item = next(item for item in receipt["line_items"] if item["item_type"] == "locker")
        assert float(seat_item["amount"]) == 1500.0
        assert float(seat_item["discount"]) == 100.0
        assert float(seat_item["final_amount"]) == 1400.0
        assert float(locker_item["amount"]) == 500.0   # 250 * 2
        assert float(receipt["combined_total"]) == 1900.0

        # Check in Database: Two payment rows created with shared receipt_id
        async with AsyncSessionLocal() as db:
            payments = (await db.execute(
                select(Payment).where(
                    Payment.tenant_id == tenant.id,
                    Payment.student_id == student.id
                )
            )).scalars().all()

            assert len(payments) == 2
            shared_receipt_id = payments[0].receipt_id
            assert shared_receipt_id is not None
            assert payments[1].receipt_id == shared_receipt_id
            types = {p.payment_type for p in payments}
            assert types == {"seat", "locker"}


@pytest.mark.asyncio
async def test_release_with_deposit_refund():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        async with AsyncSessionLocal() as db:
            tenant, user = await create_test_tenant(db, "Locker Lib 5", "locker-lib-5", "locker5@test.com")
            student = await create_test_student(db, tenant.id, "Priya Singh")

        login_res = await ac.post("/api/v1/auth/login", json={"email": user.email, "password": "password123"})
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create and assign locker with deposit
        l = (await ac.post("/api/v1/lockers", json={"label": "LK-REL", "monthly_fee": 300.0}, headers=headers)).json()
        await ac.post(f"/api/v1/lockers/{l['id']}/assign", json={
            "student_id": student.id,
            "start_date": str(date.today()),
            "monthly_fee": 300.0,
            "deposit_amount": 600.0
        }, headers=headers)

        # Release locker with deposit refund
        rel_res = await ac.post(f"/api/v1/lockers/{l['id']}/release", json={
            "refund_deposit": True
        }, headers=headers)
        assert rel_res.status_code == 200
        rel_data = rel_res.json()
        assert rel_data["success"] is True

        # Check DB: assignment is ended, deposit_returned is True
        async with AsyncSessionLocal() as db:
            asgn = (await db.execute(
                select(LockerAssignment).where(LockerAssignment.locker_id == l["id"])
            )).scalar_one()
            assert asgn.status == "ended"
            assert asgn.deposit_returned is True
            assert asgn.ended_at is not None

        # Verify locker is now vacant and available
        map_res = await ac.get("/api/v1/lockers/map", headers=headers)
        locker_after = next(item for item in map_res.json()["lockers"] if item["id"] == l["id"])
        assert locker_after["computed_status"] == "available"


@pytest.mark.asyncio
async def test_tenant_isolation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        async with AsyncSessionLocal() as db:
            tenant_a, user_a = await create_test_tenant(db, "Tenant Alpha", "alpha-lib", "alpha@test.com")
            tenant_b, user_b = await create_test_tenant(db, "Tenant Beta", "beta-lib", "beta@test.com")
            student_b = await create_test_student(db, tenant_b.id, "Beta Student")

        # Login Tenant A
        res_a = await ac.post("/api/v1/auth/login", json={"email": user_a.email, "password": "password123"})
        token_a = res_a.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # Login Tenant B
        res_b = await ac.post("/api/v1/auth/login", json={"email": user_b.email, "password": "password123"})
        token_b = res_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # Tenant A creates locker L-SECRET
        locker_a = (await ac.post("/api/v1/lockers", json={"label": "L-SECRET", "monthly_fee": 500.0}, headers=headers_a)).json()
        locker_a_id = locker_a["id"]

        # 1. Tenant B must not see Tenant A's locker in list or map
        map_b = (await ac.get("/api/v1/lockers/map", headers=headers_b)).json()
        lockers_b = map_b["lockers"]
        assert not any(l["id"] == locker_a_id for l in lockers_b)

        # 2. Tenant B direct GET must return 404
        get_b = await ac.get(f"/api/v1/lockers/{locker_a_id}", headers=headers_b)
        assert get_b.status_code == 404

        # 3. Tenant B attempt to assign Tenant A's locker must return 404
        assign_b = await ac.post(f"/api/v1/lockers/{locker_a_id}/assign", json={
            "student_id": student_b.id,
            "start_date": str(date.today()),
            "monthly_fee": 500.0
        }, headers=headers_b)
        assert assign_b.status_code == 404

        # 4. Tenant B attempt to update or delete Tenant A's locker must return 404
        update_b = await ac.put(f"/api/v1/lockers/{locker_a_id}", json={"label": "HACKED"}, headers=headers_b)
        assert update_b.status_code == 404

        delete_b = await ac.delete(f"/api/v1/lockers/{locker_a_id}", headers=headers_b)
        assert delete_b.status_code == 404
