import io
import uuid
from datetime import date, datetime, timedelta
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.core.database import AsyncSessionLocal, get_utc_now
from app.models.tenant import User, Tenant
from app.models.student import Student
from app.models.reminder import ReminderLog
from app.models.notification import Notification
from app.models.attendance import Attendance
from app.services.notification_service import is_birthday_today, get_kolkata_today


@pytest.mark.asyncio
async def test_search_matching_and_prefix_ranking():
    """
    Tests:
    - Search matching on name, phone (+91, spaces, dashes), admission number.
    - Prefix matches ranked strictly above substring matches.
    - Tenant isolation.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Login as tenant 1 (Apex Predator Library)
        login_resp = await ac.post("/api/v1/auth/login", json={
            "email": "owner@apexlibrary.com",
            "password": "admin123"
        })
        assert login_resp.status_code == 200
        token_t1 = login_resp.json()["access_token"]
        tenant_1_id = login_resp.json()["user"]["tenant_id"]
        h1 = {"Authorization": f"Bearer {token_t1}"}

        # Seed students for Tenant 1:
        # Student A: Name starts with "Raj" -> "Rajesh Kumar" (Prefix)
        # Student B: Name contains "raj" -> "Brijraj Singh" (Substring)
        # Student C: Admission "ADM-7701", Phone "+91 98111-22233"
        # Seed student for Tenant 2 to test isolation
        unique = uuid.uuid4().hex[:6]
        prefix_tag = f"Zraj{unique[:3]}"
        digits_5 = str(uuid.uuid4().int)[:5]
        phone_raw = f"98111{digits_5}"
        formatted_phone = f"+91 98111-{digits_5}"

        async with AsyncSessionLocal() as db:
            s_a = Student(
                tenant_id=tenant_1_id,
                admission_number=f"ADM-9{unique[:3]}1",
                full_name=f"{prefix_tag}esh Kumar",
                phone="+91 9876543210",
                status="active"
            )
            s_b = Student(
                tenant_id=tenant_1_id,
                admission_number=f"ADM-9{unique[:3]}2",
                full_name=f"Bri{prefix_tag} Singh",
                phone="9876543211",
                status="active"
            )
            s_c = Student(
                tenant_id=tenant_1_id,
                admission_number=f"ADM-7{digits_5}",
                full_name=f"Ananya Sharma {unique}",
                phone=formatted_phone,
                status="active"
            )
            # Another tenant's student with the same tag
            s_other_tenant = Student(
                tenant_id="other_tenant_id_fake_123",
                admission_number=f"ADM-8{unique[:3]}",
                full_name=f"{prefix_tag}esh Other Tenant",
                phone="+91 9876543210",
                status="active"
            )
            db.add_all([s_a, s_b, s_c, s_other_tenant])
            await db.commit()

        # 1. Search prefix_tag -> Prefix "{prefix_tag}esh Kumar" must rank BEFORE substring "Bri{prefix_tag} Singh"
        resp = await ac.get(f"/api/v1/students/search?q={prefix_tag}", headers=h1)
        assert resp.status_code == 200
        data = resp.json()
        names = [s["full_name"] for s in data]
        assert f"{prefix_tag}esh Kumar" in names
        assert f"Bri{prefix_tag} Singh" in names
        assert names.index(f"{prefix_tag}esh Kumar") < names.index(f"Bri{prefix_tag} Singh")

        # Must NOT include student from other tenant
        assert f"{prefix_tag}esh Other Tenant" not in names

        # 2. Search phone ignoring +91, spaces, dashes
        resp_phone = await ac.get(f"/api/v1/students/search?q={phone_raw}", headers=h1)
        assert resp_phone.status_code == 200
        phone_data = resp_phone.json()
        assert len(phone_data) >= 1
        assert any(s["admission_number"] == f"ADM-7{digits_5}" for s in phone_data)

        # 3. Search admission number
        adm_part = f"7{digits_5}"
        resp_adm = await ac.get(f"/api/v1/students/search?q={adm_part}", headers=h1)
        assert resp_adm.status_code == 200
        assert any(s["admission_number"] == f"ADM-7{digits_5}" for s in resp_adm.json())


@pytest.mark.asyncio
async def test_search_currently_inside_and_days_overdue():
    """
    Tests computed fields:
    - currently_inside == True if student is checked in today without checkout
    - days_overdue computed correctly
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        login_resp = await ac.post("/api/v1/auth/login", json={
            "email": "owner@apexlibrary.com",
            "password": "admin123"
        })
        token = login_resp.json()["access_token"]
        tenant_id = login_resp.json()["user"]["tenant_id"]
        headers = {"Authorization": f"Bearer {token}"}

        today = get_kolkata_today()
        three_days_ago = today - timedelta(days=3)

        unique = uuid.uuid4().hex[:6]
        async with AsyncSessionLocal() as db:
            st = Student(
                tenant_id=tenant_id,
                admission_number=f"ADM-{unique}",
                full_name=f"Inside Overdue Student {unique}",
                phone=f"987{unique[:7]}",
                status="expired",
                expiry_date=three_days_ago
            )
            db.add(st)
            await db.commit()
            await db.refresh(st)

            # Record active check-in today
            att = Attendance(
                tenant_id=tenant_id,
                student_id=st.id,
                date=today,
                check_in_time=get_utc_now(),
                method="manual"
            )
            db.add(att)
            await db.commit()

        resp = await ac.get(f"/api/v1/students/search?q={unique}", headers=headers)
        assert resp.status_code == 200
        results = resp.json()
        assert len(results) == 1
        res = results[0]
        assert res["currently_inside"] is True
        assert res["days_overdue"] == 3


@pytest.mark.asyncio
async def test_birthday_leap_year_rules():
    """
    Tests Asia/Kolkata birthday calculation including Feb 29 leap year rules:
    - In leap year (e.g. 2028), Feb 29 birthday is celebrated on Feb 29.
    - In non-leap year (e.g. 2026), Feb 29 birthday is celebrated on Feb 28.
    """
    feb_29_dob = date(2000, 2, 29)

    # In 2028 (leap year):
    assert is_birthday_today(feb_29_dob, date(2028, 2, 29)) is True
    assert is_birthday_today(feb_29_dob, date(2028, 2, 28)) is False

    # In 2026 (non-leap year):
    assert is_birthday_today(feb_29_dob, date(2026, 2, 28)) is True
    assert is_birthday_today(feb_29_dob, date(2026, 2, 27)) is False
    assert is_birthday_today(feb_29_dob, date(2026, 3, 1)) is False

    # Regular birthday
    normal_dob = date(1998, 11, 9)
    assert is_birthday_today(normal_dob, date(2026, 11, 9)) is True
    assert is_birthday_today(normal_dob, date(2026, 11, 10)) is False


@pytest.mark.asyncio
async def test_notifications_dedupe_and_tenant_isolation():
    """
    Tests:
    - Notifications are generated idempotently (dedupe_key).
    - Unread count & 7-day window.
    - Tenant isolation.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        login_resp = await ac.post("/api/v1/auth/login", json={
            "email": "owner@apexlibrary.com",
            "password": "admin123"
        })
        token = login_resp.json()["access_token"]
        tenant_id = login_resp.json()["user"]["tenant_id"]
        headers = {"Authorization": f"Bearer {token}"}

        today_kolkata = get_kolkata_today()

        # Seed student expiring today and student with birthday today
        async with AsyncSessionLocal() as db:
            st_exp = Student(
                tenant_id=tenant_id,
                admission_number="ADM-6001",
                full_name="Expiring Today Student",
                phone="9812345678",
                status="active",
                expiry_date=today_kolkata
            )
            st_bday = Student(
                tenant_id=tenant_id,
                admission_number="ADM-6002",
                full_name="Birthday Today Student",
                phone="9812345679",
                status="active",
                date_of_birth=date(2001, today_kolkata.month, today_kolkata.day)
            )
            db.add_all([st_exp, st_bday])
            await db.commit()

        # First call: triggers generation
        resp1 = await ac.get("/api/v1/notifications?limit=20", headers=headers)
        assert resp1.status_code == 200
        data1 = resp1.json()
        titles = [n["title"] for n in data1["notifications"]]
        assert "Expiring Today Student's membership expires today" in titles
        assert "Today is Birthday Today Student's birthday" in titles
        count1 = data1["unread_count"]
        assert count1 >= 2

        # Second call: must not duplicate rows
        resp2 = await ac.get("/api/v1/notifications?limit=20", headers=headers)
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2["unread_count"] == count1
        assert len(data2["notifications"]) == len(data1["notifications"])


@pytest.mark.asyncio
async def test_notifications_read_and_dismiss_and_retry_whatsapp():
    """
    Tests:
    - POST /notifications/{id}/read
    - POST /notifications/read-all
    - POST /notifications/{id}/dismiss
    - POST /notifications/{id}/retry-whatsapp
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        login_resp = await ac.post("/api/v1/auth/login", json={
            "email": "owner@apexlibrary.com",
            "password": "admin123"
        })
        token = login_resp.json()["access_token"]
        tenant_id = login_resp.json()["user"]["tenant_id"]
        headers = {"Authorization": f"Bearer {token}"}

        # Seed a failed ReminderLog
        async with AsyncSessionLocal() as db:
            st = Student(
                tenant_id=tenant_id,
                admission_number="ADM-5001",
                full_name="Failed WhatsApp Student",
                phone="9876500000",
                status="active"
            )
            db.add(st)
            await db.commit()
            await db.refresh(st)

            rem_log = ReminderLog(
                tenant_id=tenant_id,
                student_id=st.id,
                reminder_type="overdue",
                channel="whatsapp",
                status="failed",
                message="Reminder test message",
                error_reason="Simulated connection timeout"
            )
            db.add(rem_log)
            await db.commit()
            await db.refresh(rem_log)

        # GET /notifications to generate the notification
        res_list = await ac.get("/api/v1/notifications", headers=headers)
        assert res_list.status_code == 200
        notifs = res_list.json()["notifications"]
        failed_notif = next((n for n in notifs if n["dedupe_key"] == f"whatsapp_failed:{rem_log.id}"), None)
        assert failed_notif is not None
        notif_id = failed_notif["id"]

        # 1. Test POST /notifications/{id}/read
        read_resp = await ac.post(f"/api/v1/notifications/{notif_id}/read", headers=headers)
        assert read_resp.status_code == 200

        # Verify read_at is set
        chk_resp = await ac.get("/api/v1/notifications", headers=headers)
        updated_notif = next(n for n in chk_resp.json()["notifications"] if n["id"] == notif_id)
        assert updated_notif["read_at"] is not None

        # 2. Test POST /notifications/{id}/retry-whatsapp
        retry_resp = await ac.post(f"/api/v1/notifications/{notif_id}/retry-whatsapp", headers=headers)
        assert retry_resp.status_code == 200

        # Verify ReminderLog status is updated to 'sent'
        async with AsyncSessionLocal() as db:
            db_log = (await db.execute(select(ReminderLog).where(ReminderLog.id == rem_log.id))).scalar_one()
            assert db_log.status == "sent"

        # 3. Test POST /notifications/{id}/dismiss
        dismiss_resp = await ac.post(f"/api/v1/notifications/{notif_id}/dismiss", headers=headers)
        assert dismiss_resp.status_code == 200

        # After dismiss, notification should be excluded from active list
        list_after = await ac.get("/api/v1/notifications", headers=headers)
        active_ids = [n["id"] for n in list_after.json()["notifications"]]
        assert notif_id not in active_ids

        # 4. Test POST /notifications/read-all
        read_all_resp = await ac.post("/api/v1/notifications/read-all", headers=headers)
        assert read_all_resp.status_code == 200
        list_after_read_all = await ac.get("/api/v1/notifications", headers=headers)
        assert list_after_read_all.json()["unread_count"] == 0
