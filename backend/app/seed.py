import asyncio
import secrets
from datetime import date, timedelta
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import AsyncSessionLocal, engine, Base, get_utc_now
from app.core.security import get_password_hash
from app.models.tenant import Tenant, User
from app.models.shift import Shift
from app.models.plan import Plan
from app.models.desk import Desk
from app.models.student import Student
from app.models.allocation import SeatAllocation
from app.models.payment import Payment
from app.models.attendance import Attendance

async def seed_data():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        # Check if already seeded
        existing_tenant = await db.execute(select(Tenant).where(Tenant.slug == "apex-reading-lounge"))
        if existing_tenant.scalar_one_or_none():
            print("Database already contains seed data for 'apex-reading-lounge'.")
            return

        print("Seeding demo library: Apex Reading Lounge & Study Hub...")
        
        # 1. Create Tenant
        tenant = Tenant(
            name="Apex Reading Lounge & Study Hub",
            slug="apex-reading-lounge",
            owner_name="Vikramaditya Sharma",
            email="owner@apexlibrary.com",
            phone="+91 98765 43210",
            address="Plot 42, Knowledge Park III, Near Metro Station",
            city="Noida",
            state="Uttar Pradesh",
            pincode="201306",
            logo_url="https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=200&h=200&fit=crop",
            subscription_tier="enterprise",
            subscription_status="active",
            currency="INR",
            operating_hours="06:00 AM - 11:30 PM"
        )
        db.add(tenant)
        await db.flush()

        # 2. Create Owner & Front-Desk Staff
        owner = User(
            tenant_id=tenant.id,
            full_name="Vikramaditya Sharma",
            email="owner@apexlibrary.com",
            hashed_password=get_password_hash("admin123"),
            role="owner",
            is_active=True
        )
        staff = User(
            tenant_id=tenant.id,
            full_name="Ramesh Verma (Desk Manager)",
            email="staff@apexlibrary.com",
            hashed_password=get_password_hash("staff123"),
            role="front_desk",
            is_active=True
        )
        db.add_all([owner, staff])

        # 3. Create Shifts
        morn_shift = Shift(
            tenant_id=tenant.id,
            name="Morning Shift (6 AM - 2 PM)",
            code="MORN",
            start_time="06:00",
            end_time="14:00",
            capacity=30
        )
        eve_shift = Shift(
            tenant_id=tenant.id,
            name="Evening Shift (2 PM - 10 PM)",
            code="EVE",
            start_time="14:00",
            end_time="22:00",
            capacity=30
        )
        full_shift = Shift(
            tenant_id=tenant.id,
            name="Full Day (6 AM - 11 PM)",
            code="FULL",
            start_time="06:00",
            end_time="23:00",
            capacity=30
        )
        db.add_all([morn_shift, eve_shift, full_shift])
        await db.flush()

        # 4. Create Plans
        plans = [
            Plan(tenant_id=tenant.id, name="Monthly Morning Shift", code="M-MORN", duration_days=30, duration_months=1, price=Decimal("1200.00"), shift_type="single_shift", description="Access 6 AM to 2 PM with High-speed WiFi & AC"),
            Plan(tenant_id=tenant.id, name="Monthly Evening Shift", code="M-EVE", duration_days=30, duration_months=1, price=Decimal("1300.00"), shift_type="single_shift", description="Access 2 PM to 10 PM with High-speed WiFi & AC"),
            Plan(tenant_id=tenant.id, name="Monthly Full Day Pass", code="M-FULL", duration_days=30, duration_months=1, price=Decimal("2200.00"), shift_type="full_day", description="Unrestricted access 6 AM to 11 PM, reserved desk guaranteed"),
            Plan(tenant_id=tenant.id, name="Quarterly Full Day", code="Q-FULL", duration_days=90, duration_months=3, price=Decimal("6000.00"), shift_type="full_day", description="Save 10% on quarterly full day pass"),
        ]
        db.add_all(plans)
        await db.flush()

        # 5. Create 30 Desks (5 rows x 6 cols)
        created_desks = []
        categories = ["ac", "ac", "premium", "ladies_only", "general"]
        for r in range(1, 6):
            for c in range(1, 7):
                desk_num = f"{chr(64 + r)}-{c:02d}"  # A-01, A-02, ..., E-06
                cat = categories[(r + c) % len(categories)]
                zone = "Quiet Zone" if r in [1, 2] else "Main Hall"
                d = Desk(
                    tenant_id=tenant.id,
                    desk_number=desk_num,
                    zone=zone,
                    row=r,
                    column=c,
                    category=cat,
                    is_active=True
                )
                db.add(d)
                created_desks.append(d)
        await db.flush()

        # 6. Create realistic students
        student_specs = [
            ("Aarav Patel", "+91 98111 22334", "aarav.upsc@gmail.com", "UPSC Civil Services Aspirant"),
            ("Priya Nair", "+91 98222 33445", "priya.ca@gmail.com", "CA Final Exam Preparation"),
            ("Rohan Sharma", "+91 98333 44556", "rohan.neet@gmail.com", "NEET PG Aspirant"),
            ("Ananya Iyer", "+91 98444 55667", "ananya.gate@gmail.com", "GATE Computer Science"),
            ("Aditya Joshi", "+91 98555 66778", "aditya.j@gmail.com", "State PCS Prep"),
            ("Sneha Kulkarni", "+91 98666 77889", "sneha.k@gmail.com", "Judiciary Exam Prep"),
            ("Vikram Malhotra", "+91 98777 88990", "vikram.m@gmail.com", "Remote Software Engineer"),
            ("Neha Gupta", "+91 98888 99001", "neha.g@gmail.com", "Banking PO Aspirant"),
            ("Karthik Raman", "+91 98999 00112", "karthik.r@gmail.com", "CAT 2026 Aspirant"),
            ("Meera Sen", "+91 97111 11223", "meera.s@gmail.com", "UPSC Mains Revision"),
            ("Rahul Deshmukh", "+91 97222 22334", "rahul.d@gmail.com", "SSC CGL Prep"),
            ("Kavita Reddy", "+91 97333 33445", "kavita.r@gmail.com", "RBI Grade B"),
        ]

        today = date.today()
        created_students = []
        for i, (name, phone, email, notes) in enumerate(student_specs):
            adm = f"ADM-{(1001 + i)}"
            # Stagger expiry dates: some due soon, some valid
            expiry = today + timedelta(days=15 if i % 3 == 0 else (3 if i % 3 == 1 else 45))
            student = Student(
                tenant_id=tenant.id,
                admission_number=adm,
                full_name=name,
                phone=phone,
                email=email,
                id_proof_type="Aadhaar",
                id_proof_number=f"{1000 + i} 4321 9876",
                address="Sector 62, Noida",
                status="active",
                join_date=today - timedelta(days=30),
                expiry_date=expiry,
                qr_code_token=secrets.token_urlsafe(16),
                notes=notes
            )
            db.add(student)
            created_students.append(student)
        await db.flush()

        # 7. Seat Allocations & Conflict Test Demonstrations:
        # Desk A-01: Aarav in Morning shift
        # Desk A-01: Priya in Evening shift (Same desk, different shift -> VALID multi-shift sharing!)
        # Desk A-02: Rohan in Full Day shift
        # Desk A-03: Ananya in Full Day shift
        allocations_to_create = [
            (created_students[0], created_desks[0], morn_shift),  # Aarav -> A-01 Morning
            (created_students[1], created_desks[0], eve_shift),   # Priya -> A-01 Evening (shared desk!)
            (created_students[2], created_desks[1], full_shift),  # Rohan -> A-02 Full Day
            (created_students[3], created_desks[2], full_shift),  # Ananya -> A-03 Full Day
            (created_students[4], created_desks[3], morn_shift),  # Aditya -> A-04 Morning
            (created_students[5], created_desks[4], full_shift),  # Sneha -> A-05 Full Day
            (created_students[6], created_desks[5], eve_shift),   # Vikram -> A-06 Evening
            (created_students[7], created_desks[6], morn_shift),  # Neha -> B-01 Morning
            (created_students[8], created_desks[7], full_shift),  # Karthik -> B-02 Full Day
            (created_students[9], created_desks[8], eve_shift),   # Meera -> B-03 Evening
        ]

        for stu, dsk, shf in allocations_to_create:
            alloc = SeatAllocation(
                tenant_id=tenant.id,
                student_id=stu.id,
                desk_id=dsk.id,
                shift_id=shf.id,
                start_date=today - timedelta(days=15),
                end_date=stu.expiry_date,
                status="active"
            )
            db.add(alloc)

        # 8. Record Payments
        for i, stu in enumerate(created_students[:10]):
            plan = plans[2] if i in [2, 3, 5, 8] else (plans[0] if i % 2 == 0 else plans[1])
            payment = Payment(
                tenant_id=tenant.id,
                student_id=stu.id,
                plan_id=plan.id,
                receipt_number=f"REC-2026-{(i + 1):04d}",
                amount=plan.price,
                discount=Decimal("0.00"),
                final_amount=plan.price,
                payment_mode="upi" if i % 2 == 0 else "cash",
                transaction_reference=f"UPI{secrets.randbelow(1000000000):010d}" if i % 2 == 0 else None,
                payment_date=today - timedelta(days=15),
                period_start=today - timedelta(days=15),
                period_end=stu.expiry_date,
                next_due_date=stu.expiry_date,
                status="paid",
                remarks="Initial admission & security fee paid."
            )
            db.add(payment)

        # 9. Record Today's Attendance Check-ins
        for stu in created_students[:6]:
            att = Attendance(
                tenant_id=tenant.id,
                student_id=stu.id,
                date=today,
                check_in_time=get_utc_now() - timedelta(hours=secrets.randbelow(4) + 1),
                method="qr"
            )
            db.add(att)

        await db.commit()
        print("Seed completed successfully!")
        print("Demo Tenant: Apex Reading Lounge & Study Hub")
        print("Login credentials: email='owner@apexlibrary.com', password='admin123'")

if __name__ == "__main__":
    asyncio.run(seed_data())
