import re
from datetime import date, timedelta
from typing import Optional, List, Tuple
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, text
from sqlalchemy.orm import selectinload

from app.models.allocation import Allocation, AllocationShift
from app.models.desk import Desk
from app.models.shift import Shift
from app.models.student import Student
from app.models.plan import Plan, PlanShift
from app.models.tenant import Tenant
from app.schemas.allocation import AllocationCreate, ReassignRequest, RenewalRequest

def natural_sort_key(s: str):
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', s or '')]

class AllocationService:
    @staticmethod
    async def get_available_seats(
        db: AsyncSession,
        tenant_id: str,
        shift_ids: List[str],
        start_date: date,
        end_date: date,
        zone_id: Optional[str] = None,
        gender: Optional[str] = None,
        exclude_allocation_id: Optional[str] = None,
        exclude_student_id: Optional[str] = None
    ) -> List[Desk]:
        """
        Finds desks that are free across EVERY shift in `shift_ids` for the ENTIRE date range.
        Filtered by zone, gender restrictions, and a 30-day grace period after end_date.
        """
        if not shift_ids:
            return []

        # Check if any requested shift has code FULL
        req_shifts_res = await db.execute(select(Shift).where(Shift.id.in_(shift_ids)))
        req_shifts = list(req_shifts_res.scalars().all())
        has_full_req = any((s.code or "").upper() == "FULL" for s in req_shifts)

        tenant_res = await db.execute(select(Tenant.grace_period_days).where(Tenant.id == tenant_id))
        grace_days = tenant_res.scalar_one_or_none() or 30

        # 1. Query occupied seat IDs in ANY of the requested shifts during the date range
        # Note: Every active/overdue allocation reserves the seat until end_date + grace_days
        conflict_query = (
            select(AllocationShift)
            .join(Shift, AllocationShift.shift_id == Shift.id)
            .join(Allocation, AllocationShift.allocation_id == Allocation.id)
            .where(
                AllocationShift.tenant_id == tenant_id,
                AllocationShift.status.in_(["active", "overdue"]),
                AllocationShift.start_date <= end_date,
            )
        )
        if not has_full_req:
            conflict_query = conflict_query.where(
                or_(
                    AllocationShift.shift_id.in_(shift_ids),
                    Shift.code == "FULL"
                )
            )

        if exclude_student_id:
            conflict_query = conflict_query.where(Allocation.student_id != exclude_student_id)
        if exclude_allocation_id:
            conflict_query = conflict_query.where(AllocationShift.allocation_id != exclude_allocation_id)
        
        conflict_res = await db.execute(conflict_query)
        occupied_seat_ids = set()
        for ashift in conflict_res.scalars().all():
            eff_end = ashift.end_date + timedelta(days=grace_days)
            if eff_end >= start_date:
                occupied_seat_ids.add(ashift.seat_id)

        # 2. Query active desks for tenant
        desk_query = select(Desk).where(
            Desk.tenant_id == tenant_id,
            Desk.is_active == True
        )
        if zone_id:
            desk_query = desk_query.where(or_(Desk.zone == zone_id, Desk.id == zone_id))

        if occupied_seat_ids:
            desk_query = desk_query.where(~Desk.id.in_(occupied_seat_ids))

        desk_res = await db.execute(desk_query)
        desks = list(desk_res.scalars().all())

        # 3. Filter gender if male on ladies_only
        if gender and gender.lower() == "male":
            desks = [d for d in desks if (d.category or "").lower() != "ladies_only"]

        # 4. Sort desks naturally: lowest-numbered seat first (A-01, A-02, etc.)
        desks.sort(key=lambda d: (d.zone or "", natural_sort_key(d.desk_number)))
        return desks

    @staticmethod
    async def check_seat_availability(
        db: AsyncSession,
        tenant_id: str,
        seat_id: str,
        shift_ids: List[str],
        start_date: date,
        end_date: date,
        exclude_allocation_id: Optional[str] = None,
        exclude_student_id: Optional[str] = None,
        raise_on_conflict: bool = True
    ) -> bool:
        """
        Re-checks availability inside transaction at save time.
        Raises 409 Conflict if occupied in any shift for the date range (including grace period).
        """
        desk_query = select(Desk).where(Desk.id == seat_id, Desk.tenant_id == tenant_id, Desk.is_active == True)
        if db.bind and db.bind.dialect.name != "sqlite":
            desk_query = desk_query.with_for_update()
        desk_res = await db.execute(desk_query)
        desk = desk_res.scalar_one_or_none()
        if not desk:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Seat not found or is inactive.")

        req_shifts_res = await db.execute(select(Shift).where(Shift.id.in_(shift_ids)))
        req_shifts = list(req_shifts_res.scalars().all())
        has_full_req = any((s.code or "").upper() == "FULL" for s in req_shifts)

        tenant_res = await db.execute(select(Tenant.grace_period_days).where(Tenant.id == tenant_id))
        grace_days = tenant_res.scalar_one_or_none() or 30

        conflict_query = (
            select(AllocationShift)
            .join(Shift, AllocationShift.shift_id == Shift.id)
            .join(Allocation, AllocationShift.allocation_id == Allocation.id)
            .options(selectinload(AllocationShift.shift), selectinload(AllocationShift.allocation).selectinload(Allocation.student))
            .where(
                AllocationShift.tenant_id == tenant_id,
                AllocationShift.seat_id == seat_id,
                AllocationShift.status.in_(["active", "overdue"]),
                AllocationShift.start_date <= end_date,
            )
        )
        if not has_full_req:
            conflict_query = conflict_query.where(
                or_(
                    AllocationShift.shift_id.in_(shift_ids),
                    Shift.code == "FULL"
                )
            )

        if exclude_student_id:
            conflict_query = conflict_query.where(Allocation.student_id != exclude_student_id)
        if exclude_allocation_id:
            conflict_query = conflict_query.where(AllocationShift.allocation_id != exclude_allocation_id)
        if db.bind and db.bind.dialect.name != "sqlite":
            conflict_query = conflict_query.with_for_update()

        conflict_res = await db.execute(conflict_query)
        candidates = conflict_res.scalars().all()
        conflicts = []
        for ashift in candidates:
            eff_end = ashift.end_date + timedelta(days=grace_days)
            if eff_end >= start_date:
                conflicts.append(ashift)

        if conflicts:
            if not raise_on_conflict:
                return False
            conf = conflicts[0]
            student_name = conf.allocation.student.full_name if conf.allocation and conf.allocation.student else "Another student"
            shift_name = conf.shift.name if conf.shift else "Shift"
            grace_end = conf.end_date + timedelta(days=grace_days)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Seat {desk.desk_number} is already occupied / held by {student_name} ({shift_name}) under subscription/grace period until {grace_end}."
            )
        return True

    @staticmethod
    async def allocate_seat(
        db: AsyncSession,
        tenant_id: str,
        data: AllocationCreate,
        auto_commit: bool = True
    ) -> Allocation:
        """
        Single backend entry point to allocate a seat.
        Snapshots shifts into allocation_shifts at allocation time.
        """
        # 1. Validate student
        student_query = select(Student).where(Student.id == data.student_id, Student.tenant_id == tenant_id)
        student_res = await db.execute(student_query)
        student = student_res.scalar_one_or_none()
        if not student:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

        # 2. Determine shifts and end date
        shift_ids: List[str] = []
        plan: Optional[Plan] = None
        duration_days = 30
        zone_id = None

        if data.plan_id:
            plan_query = (
                select(Plan)
                .options(selectinload(Plan.plan_shifts))
                .where(Plan.id == data.plan_id, Plan.tenant_id == tenant_id)
            )
            plan_res = await db.execute(plan_query)
            plan = plan_res.scalar_one_or_none()
            if not plan:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found.")
            duration_days = plan.duration_days
            zone_id = plan.zone_id
            shift_ids = [ps.shift_id for ps in plan.plan_shifts]
            if not shift_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Plan '{plan.name}' has no included operating shifts configured."
                )

        if not shift_ids:
            if data.shift_ids:
                shift_ids = data.shift_ids
            elif data.shift_id:
                shift_ids = [data.shift_id]

        if not shift_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one shift is required for allocation.")

        # Validate shifts exist and are active
        sh_res = await db.execute(
            select(Shift).where(Shift.id.in_(shift_ids), Shift.tenant_id == tenant_id, Shift.is_active == True)
        )
        valid_shifts = sh_res.scalars().all()
        if len(valid_shifts) != len(set(shift_ids)):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="One or more specified shifts are invalid or inactive.")

        # Determine dates
        start_date = data.start_date
        if data.end_date:
            end_date = data.end_date
        else:
            end_date = start_date + timedelta(days=duration_days - 1)

        if start_date > end_date:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Start date must be before or equal to end date.")

        # 3. Resolve seat
        seat_id = data.seat_id or data.desk_id
        if not seat_id:
            # Auto-pick lowest-numbered seat free across all shifts
            available = await AllocationService.get_available_seats(
                db=db,
                tenant_id=tenant_id,
                shift_ids=shift_ids,
                start_date=start_date,
                end_date=end_date,
                zone_id=zone_id,
                gender=student.gender
            )
            if not available:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="No seat is available across all required shifts for the requested date range."
                )
            seat_id = available[0].id

        # 4. Check desk & gender
        desk_query = select(Desk).where(Desk.id == seat_id, Desk.tenant_id == tenant_id, Desk.is_active == True)
        desk_res = await db.execute(desk_query)
        desk = desk_res.scalar_one_or_none()
        if not desk:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Seat not found or is inactive.")

        if (desk.category or "").lower() == "ladies_only":
            if (student.gender or "").lower() == "male":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Seat {desk.desk_number} is reserved for female students (LADIES_ONLY)."
                )

        # 5. Concurrency safety re-check inside transaction
        await AllocationService.check_seat_availability(
            db=db,
            tenant_id=tenant_id,
            seat_id=seat_id,
            shift_ids=shift_ids,
            start_date=start_date,
            end_date=end_date,
            exclude_student_id=student.id
        )

        # 6. Vacate/close prior active allocations for this student if overlapping with requested period
        prior_res = await db.execute(
            select(Allocation)
            .options(selectinload(Allocation.allocation_shifts))
            .where(
                Allocation.tenant_id == tenant_id,
                Allocation.student_id == student.id,
                Allocation.status.in_(["active", "overdue"])
            )
        )
        for prev_alloc in prior_res.scalars().all():
            if start_date <= prev_alloc.end_date:
                prev_alloc.status = "cancelled"
                for prev_ash in prev_alloc.allocation_shifts:
                    prev_ash.status = "cancelled"

        # 7. Create Allocation
        allocation = Allocation(
            tenant_id=tenant_id,
            student_id=student.id,
            plan_id=data.plan_id,
            seat_id=seat_id,
            start_date=start_date,
            end_date=end_date,
            status="active"
        )
        db.add(allocation)
        await db.flush()

        # 8. Snapshot shifts into allocation_shifts
        for sh_id in shift_ids:
            ash = AllocationShift(
                tenant_id=tenant_id,
                allocation_id=allocation.id,
                shift_id=sh_id,
                seat_id=seat_id,
                start_date=start_date,
                end_date=end_date,
                status="active"
            )
            db.add(ash)

        # Update student expiry date and status
        if not student.expiry_date or student.expiry_date < end_date:
            student.expiry_date = end_date
        if student.status in ("expired", "suspended"):
            student.status = "active"

        if auto_commit:
            await db.commit()
            await db.refresh(allocation)

        return allocation

    @staticmethod
    async def renew_allocation(
        db: AsyncSession,
        tenant_id: str,
        student_id: str,
        plan_id: Optional[str] = None,
        duration_days: Optional[int] = None,
        auto_commit: bool = True
    ) -> Allocation:
        """
        Extends end_date of existing allocation without changing seat or shifts.
        Ensures the extended range does not conflict with another allocation.
        """
        # Find current active or overdue allocation for student
        alloc_query = (
            select(Allocation)
            .options(
                selectinload(Allocation.allocation_shifts),
                selectinload(Allocation.student),
                selectinload(Allocation.desk)
            )
            .where(
                Allocation.tenant_id == tenant_id,
                Allocation.student_id == student_id,
                Allocation.status.in_(["active", "overdue"])
            )
            .order_by(Allocation.end_date.desc())
        )
        alloc_res = await db.execute(alloc_query)
        allocation = alloc_res.scalars().first()
        if not allocation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active or overdue allocation found for renewal."
            )

        # Determine extension duration
        extension_days = 30
        if plan_id:
            plan_res = await db.execute(select(Plan).where(Plan.id == plan_id, Plan.tenant_id == tenant_id))
            plan = plan_res.scalar_one_or_none()
            if plan:
                extension_days = plan.duration_days
        elif allocation.plan_id:
            plan_res = await db.execute(select(Plan).where(Plan.id == allocation.plan_id, Plan.tenant_id == tenant_id))
            plan = plan_res.scalar_one_or_none()
            if plan:
                extension_days = plan.duration_days
        elif duration_days:
            extension_days = duration_days

        # New end date calculation
        # If renewing before expiry, start extension from existing end_date + 1
        # If renewing while overdue, extension starts from max(existing end_date, today)
        base_date = allocation.end_date
        new_end_date = base_date + timedelta(days=extension_days)
        extended_start = base_date + timedelta(days=1)

        # Conflict check for extended range
        shift_ids = [ash.shift_id for ash in allocation.allocation_shifts]
        await AllocationService.check_seat_availability(
            db=db,
            tenant_id=tenant_id,
            seat_id=allocation.seat_id,
            shift_ids=shift_ids,
            start_date=extended_start,
            end_date=new_end_date,
            exclude_allocation_id=allocation.id
        )

        # Extend allocation and snapshot shifts
        allocation.end_date = new_end_date
        allocation.status = "active"
        if plan_id:
            allocation.plan_id = plan_id

        for ash in allocation.allocation_shifts:
            ash.end_date = new_end_date
            ash.status = "active"

        # Update student
        student = allocation.student
        if student:
            if not student.expiry_date or student.expiry_date < new_end_date:
                student.expiry_date = new_end_date
            student.status = "active"

        if auto_commit:
            await db.commit()
            await db.refresh(allocation)

        return allocation

    @staticmethod
    async def vacate_seat(
        db: AsyncSession,
        tenant_id: str,
        allocation_id: str,
        notes: str = "",
        auto_commit: bool = True
    ) -> Allocation:
        query = (
            select(Allocation)
            .options(selectinload(Allocation.allocation_shifts))
            .where(Allocation.id == allocation_id, Allocation.tenant_id == tenant_id)
        )
        result = await db.execute(query)
        allocation = result.scalar_one_or_none()
        if not allocation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allocation not found.")

        allocation.status = "cancelled"
        for ash in allocation.allocation_shifts:
            ash.status = "cancelled"

        if auto_commit:
            await db.commit()
            await db.refresh(allocation)
        return allocation

    @staticmethod
    async def reassign_seat(
        db: AsyncSession,
        tenant_id: str,
        allocation_id: str,
        data: ReassignRequest,
        auto_commit: bool = True
    ) -> Allocation:
        curr_res = await db.execute(
            select(Allocation)
            .options(selectinload(Allocation.allocation_shifts))
            .where(Allocation.id == allocation_id, Allocation.tenant_id == tenant_id)
        )
        curr_alloc = curr_res.scalar_one_or_none()
        if not curr_alloc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allocation not found to reassign.")

        student_id = curr_alloc.student_id
        plan_id = data.new_plan_id or curr_alloc.plan_id
        new_seat_id = data.new_seat_id or data.new_desk_id
        start_date = data.start_date or date.today()
        end_date = data.end_date or curr_alloc.end_date

        shift_ids = data.new_shift_ids or ([data.new_shift_id] if data.new_shift_id else None)
        if not shift_ids:
            shift_ids = [ash.shift_id for ash in curr_alloc.allocation_shifts]

        # Close old allocation as cancelled
        curr_alloc.status = "cancelled"
        for ash in curr_alloc.allocation_shifts:
            ash.status = "cancelled"
        await db.flush()

        alloc_create = AllocationCreate(
            student_id=student_id,
            plan_id=plan_id,
            seat_id=new_seat_id,
            shift_ids=shift_ids,
            start_date=start_date,
            end_date=end_date
        )
        return await AllocationService.allocate_seat(db, tenant_id, alloc_create, auto_commit=auto_commit)

    @staticmethod
    async def change_allocation(
        db: AsyncSession,
        tenant_id: str,
        allocation_id: str,
        new_seat_id: str,
        new_plan_id: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        auto_commit: bool = True
    ) -> Allocation:
        """
        Changes a student's seat allocation during payment/renewal when switching seats.
        """
        data = ReassignRequest(
            new_seat_id=new_seat_id,
            new_plan_id=new_plan_id,
            start_date=start_date,
            end_date=end_date
        )
        return await AllocationService.reassign_seat(
            db=db,
            tenant_id=tenant_id,
            allocation_id=allocation_id,
            data=data,
            auto_commit=auto_commit
        )

    @staticmethod
    async def replace_occupant(
        db: AsyncSession,
        tenant_id: str,
        current_allocation_id: str,
        new_student_id: str,
        shift_ids: Optional[List[str]] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        plan_id: Optional[str] = None,
        auto_commit: bool = True
    ) -> Allocation:
        """
        Owner force-reassigns a desk to a new student from Visual Seat Map,
        clearing the prior occupant's allocation (active or in grace period).
        """
        curr_res = await db.execute(
            select(Allocation)
            .options(selectinload(Allocation.allocation_shifts))
            .where(Allocation.id == current_allocation_id, Allocation.tenant_id == tenant_id)
        )
        curr_alloc = curr_res.scalar_one_or_none()
        if not curr_alloc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Current seat allocation not found.")

        seat_id = curr_alloc.seat_id
        if not shift_ids:
            shift_ids = [ash.shift_id for ash in curr_alloc.allocation_shifts]

        # Vacate the current occupant's allocation
        curr_alloc.status = "cancelled"
        for ash in curr_alloc.allocation_shifts:
            ash.status = "cancelled"
        await db.flush()

        alloc_create = AllocationCreate(
            student_id=new_student_id,
            plan_id=plan_id,
            seat_id=seat_id,
            shift_ids=shift_ids,
            start_date=start_date or date.today(),
            end_date=end_date or (date.today() + timedelta(days=29))
        )
        return await AllocationService.allocate_seat(db, tenant_id, alloc_create, auto_commit=auto_commit)

    @staticmethod
    async def process_overdue_and_expirations(db: AsyncSession, tenant_id: Optional[str] = None) -> dict:
        """
        Scheduled lifecycle job:
        - active -> overdue when end_date passes without payment
        - overdue -> expired after grace period (stored per tenant, default 30 days), freeing seat.
        """
        today = date.today()

        # Load tenants
        tenant_q = select(Tenant).where(Tenant.is_active == True)
        if tenant_id:
            tenant_q = tenant_q.where(Tenant.id == tenant_id)
        tenant_res = await db.execute(tenant_q)
        tenants = tenant_res.scalars().all()

        overdue_count = 0
        expired_count = 0

        for t in tenants:
            grace_days = t.grace_period_days or 30

            # 1. Active allocations that have passed end_date -> OVERDUE
            active_q = (
                select(Allocation)
                .options(selectinload(Allocation.allocation_shifts))
                .where(
                    Allocation.tenant_id == t.id,
                    Allocation.status == "active",
                    Allocation.end_date < today
                )
            )
            active_res = await db.execute(active_q)
            for alloc in active_res.scalars().all():
                alloc.status = "overdue"
                for ash in alloc.allocation_shifts:
                    ash.status = "overdue"
                overdue_count += 1

            # 2. Overdue allocations that have exceeded grace period -> EXPIRED (frees seat!)
            cutoff_date = today - timedelta(days=grace_days)
            overdue_q = (
                select(Allocation)
                .options(selectinload(Allocation.allocation_shifts), selectinload(Allocation.student))
                .where(
                    Allocation.tenant_id == t.id,
                    Allocation.status == "overdue",
                    Allocation.end_date < cutoff_date
                )
            )
            overdue_res = await db.execute(overdue_q)
            for alloc in overdue_res.scalars().all():
                alloc.status = "expired"
                for ash in alloc.allocation_shifts:
                    ash.status = "expired"
                if alloc.student:
                    alloc.student.status = "expired"
                expired_count += 1

        await db.commit()
        return {"overdue_marked": overdue_count, "expired_marked": expired_count}
