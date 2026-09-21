import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from datetime import date, timedelta
from decimal import Decimal

from app.main import app
from app.core.database import AsyncSessionLocal
from app.models.tenant import Tenant, User
from app.models.desk import Desk
from app.models.shift import Shift
from app.models.student import Student

@pytest.mark.asyncio
async def test_health():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"

@pytest.mark.asyncio
async def test_login_and_auth_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Test valid login with seeded user
        response = await ac.post("/api/v1/auth/login", json={
            "email": "owner@apexlibrary.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["email"] == "owner@apexlibrary.com"
        assert data["tenant"]["slug"] == "apex-reading-lounge"

        token = data["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Test authenticated endpoint: /auth/me
        me_resp = await ac.get("/api/v1/auth/me", headers=headers)
        assert me_resp.status_code == 200
        assert me_resp.json()["email"] == "owner@apexlibrary.com"

        # Ensure at least one check-in exists today for testing dashboard & attendance endpoints
        students_resp = await ac.get("/api/v1/students", headers=headers)
        assert students_resp.status_code == 200
        first_student = students_resp.json()[0]

        # Record check-in for first student if not already checked in today
        await ac.post(
            "/api/v1/attendance/check-in",
            json={"student_id": first_student["id"], "method": "manual"},
            headers=headers
        )

        # Test dashboard summary
        dash_resp = await ac.get("/api/v1/dashboard/summary", headers=headers)
        assert dash_resp.status_code == 200
        dash_data = dash_resp.json()
        assert dash_data["total_desks"] >= 30
        assert dash_data["total_active_students"] >= 10
        assert dash_data["today_checkins_count"] >= 1

        # Test GET /attendance/today endpoint
        att_resp = await ac.get("/api/v1/attendance/today", headers=headers)
        assert att_resp.status_code == 200
        today_list = att_resp.json()
        assert len(today_list) >= 1
        assert any(a["student_id"] == first_student["id"] for a in today_list)


@pytest.mark.asyncio
async def test_seat_allocation_conflict_prevention():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        login_resp = await ac.post("/api/v1/auth/login", json={
            "email": "owner@apexlibrary.com",
            "password": "admin123"
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Get list of desks and shifts
        desks_resp = await ac.get("/api/v1/desks", headers=headers)
        shifts_resp = await ac.get("/api/v1/shifts", headers=headers)
        students_resp = await ac.get("/api/v1/students", headers=headers)

        desk_a1 = next(d for d in desks_resp.json() if d["desk_number"] == "A-01")
        morn_shift = next(s for s in shifts_resp.json() if s["code"] == "MORN")
        student_test = students_resp.json()[-1]  # Pick last student

        # Desk A-01 is ALREADY allocated to Aarav in the morning shift!
        # Attempting to double-allocate desk A-01 for Morning shift MUST return 409 Conflict:
        today = date.today()
        conflict_resp = await ac.post("/api/v1/allocations", json={
            "student_id": student_test["id"],
            "desk_id": desk_a1["id"],
            "shift_id": morn_shift["id"],
            "start_date": today.isoformat(),
            "end_date": (today + timedelta(days=30)).isoformat()
        }, headers=headers)

        assert conflict_resp.status_code == 409
        assert "already occupied" in conflict_resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_tenant_settings_and_shifts_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        login_resp = await ac.post("/api/v1/auth/login", json={
            "email": "owner@apexlibrary.com",
            "password": "admin123"
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Test updating tenant settings
        update_resp = await ac.put("/api/v1/auth/tenant", json={
            "operating_hours": "07:00 AM - 11:00 PM",
            "city": "Noida Knowledge Park"
        }, headers=headers)
        assert update_resp.status_code == 200
        assert update_resp.json()["operating_hours"] == "07:00 AM - 11:00 PM"
        assert update_resp.json()["city"] == "Noida Knowledge Park"

        # 2. Test creating and deleting a shift
        new_shift_resp = await ac.post("/api/v1/shifts", json={
            "name": "Late Night Shift",
            "code": "LNIGHT",
            "start_time": "22:00",
            "end_time": "06:00",
            "capacity": 30,
            "is_active": True
        }, headers=headers)
        assert new_shift_resp.status_code == 201
        created_shift_id = new_shift_resp.json()["id"]

        # Delete the shift
        del_shift_resp = await ac.delete(f"/api/v1/shifts/{created_shift_id}", headers=headers)
        assert del_shift_resp.status_code == 204

@pytest.mark.asyncio
async def test_whatsapp_reminders_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        login_resp = await ac.post("/api/v1/auth/login", json={
            "email": "owner@apexlibrary.com",
            "password": "admin123"
        })
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Trigger reminders scan
        trigger_resp = await ac.post("/api/v1/reminders/trigger", headers=headers)
        assert trigger_resp.status_code == 200
        data = trigger_resp.json()
        assert "sent_count" in data

        # 2. Fetch reminder audit logs
        logs_resp = await ac.get("/api/v1/reminders/logs", headers=headers)
        assert logs_resp.status_code == 200
        logs = logs_resp.json()
        assert isinstance(logs, list)
        if len(logs) > 0:
            assert logs[0]["channel"] == "whatsapp"
            assert "id" in logs[0]
            assert "message" in logs[0]


