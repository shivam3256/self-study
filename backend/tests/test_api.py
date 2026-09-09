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

        # Test dashboard summary
        dash_resp = await ac.get("/api/v1/dashboard/summary", headers=headers)
        assert dash_resp.status_code == 200
        dash_data = dash_resp.json()
        assert dash_data["total_desks"] >= 30
        assert dash_data["total_active_students"] >= 10
        assert dash_data["today_checkins_count"] >= 1

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
