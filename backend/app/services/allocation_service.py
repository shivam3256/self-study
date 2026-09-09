from datetime import date
from typing import Optional, List, Tuple
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload

from app.models.allocation import SeatAllocation
from app.models.desk import Desk
from app.models.shift import Shift
from app.models.student import Student
from app.schemas.allocation import AllocationCreate

class AllocationService:
    @staticmethod
    async def allocate_seat(
        db: AsyncSession,
        tenant_id: str,
        data: AllocationCreate
    ) -> SeatAllocation:
        # 1. Validate desk exists in tenant
        desk_query = select(Desk).where(Desk.id == data.desk_id, Desk.tenant_id == tenant_id, Desk.is_active == True)
        desk_res = await db.execute(desk_query)
        desk = desk_res.scalar_one_or_none()
        if not desk:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Desk not found or is inactive.")

        # 2. Validate student exists in tenant
        student_query = select(Student).where(Student.id == data.student_id, Student.tenant_id == tenant_id)
        student_res = await db.execute(student_query)
        student = student_res.scalar_one_or_none()
        if not student:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

        # 3. Validate shift exists in tenant
        shift_query = select(Shift).where(Shift.id == data.shift_id, Shift.tenant_id == tenant_id, Shift.is_active == True)
        shift_res = await db.execute(shift_query)
        shift = shift_res.scalar_one_or_none()
        if not shift:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift not found or is inactive.")

        if data.start_date > data.end_date:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Start date must be before or equal to end date.")

        # 4. Conflict detection: Check if desk is already assigned for overlapping shift and dates
        # Note: If shift is full-day, it conflicts with ALL shifts. If another shift is full-day, it conflicts as well.
        conflict_query = (
            select(SeatAllocation)
            .options(selectinload(SeatAllocation.student))
            .where(
                SeatAllocation.tenant_id == tenant_id,
                SeatAllocation.desk_id == data.desk_id,
                SeatAllocation.status == "active",
                # Date overlap check: [start_date, end_date] overlaps with existing [existing.start_date, existing.end_date]
                SeatAllocation.start_date <= data.end_date,
                SeatAllocation.end_date >= data.start_date
            )
        )
        conflict_res = await db.execute(conflict_query)
        existing_allocations = conflict_res.scalars().all()

        for existing in existing_allocations:
            # Check shift conflict
            is_same_shift = existing.shift_id == data.shift_id
            # If current or existing is full day (code FULL), they conflict
            existing_shift_res = await db.execute(select(Shift).where(Shift.id == existing.shift_id))
            existing_shift = existing_shift_res.scalar_one_or_none()
            
            has_shift_conflict = is_same_shift or (
                existing_shift and existing_shift.code == "FULL"
            ) or (shift.code == "FULL")

            if has_shift_conflict:
                occupant_name = existing.student.full_name if existing.student else "Another student"
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Desk {desk.desk_number} is already occupied by {occupant_name} for this shift until {existing.end_date}."
                )

        # 5. Create new allocation
        allocation = SeatAllocation(
            tenant_id=tenant_id,
            student_id=data.student_id,
            desk_id=data.desk_id,
            shift_id=data.shift_id,
            start_date=data.start_date,
            end_date=data.end_date,
            status="active"
        )
        db.add(allocation)
        
        # If student expiry date is empty or before allocation end date, update it
        if not student.expiry_date or student.expiry_date < data.end_date:
            student.expiry_date = data.end_date
            
        await db.commit()
        await db.refresh(allocation)
        return allocation

    @staticmethod
    async def vacate_seat(
        db: AsyncSession,
        tenant_id: str,
        allocation_id: str
    ) -> SeatAllocation:
        query = select(SeatAllocation).where(
            SeatAllocation.id == allocation_id,
            SeatAllocation.tenant_id == tenant_id
        )
        result = await db.execute(query)
        allocation = result.scalar_one_or_none()
        if not allocation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Allocation not found.")

        allocation.status = "vacated"
        await db.commit()
        await db.refresh(allocation)
        return allocation
