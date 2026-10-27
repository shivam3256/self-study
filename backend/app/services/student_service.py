import re
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.student import Student

async def generate_next_admission_number(db: AsyncSession, tenant_id: str) -> str:
    """
    Generates the next sequential admission number for a library (tenant).
    Format: ADM-0001, ADM-0002, ADM-0003... (4-digit zero-padded).
    """
    res = await db.execute(
        select(Student.admission_number).where(Student.tenant_id == tenant_id)
    )
    existing_admissions = set(res.scalars().all())

    max_num = 0
    has_sequential = False
    for adm in existing_admissions:
        if not adm:
            continue
        # Only match purely numeric suffixes (e.g. ADM-0001), ignoring hex tokens like ADM-5B4D0788
        match = re.fullmatch(r"ADM-(\d+)", adm.strip(), re.IGNORECASE)
        if match:
            has_sequential = True
            try:
                num = int(match.group(1))
                if num > max_num:
                    max_num = num
            except ValueError:
                pass

    if not has_sequential:
        max_num = len(existing_admissions)

    next_num = max_num + 1
    candidate = f"ADM-{next_num:04d}"

    while candidate in existing_admissions:
        next_num += 1
        candidate = f"ADM-{next_num:04d}"

    return candidate


async def get_next_admission_sequence_start(db: AsyncSession, tenant_id: str) -> int:
    """
    Returns the next starting integer sequence for batch creations (e.g. Excel import).
    """
    res = await db.execute(
        select(Student.admission_number).where(Student.tenant_id == tenant_id)
    )
    existing_admissions = set(res.scalars().all())

    max_num = 0
    has_sequential = False
    for adm in existing_admissions:
        if not adm:
            continue
        match = re.fullmatch(r"ADM-(\d+)", adm.strip(), re.IGNORECASE)
        if match:
            has_sequential = True
            try:
                num = int(match.group(1))
                if num > max_num:
                    max_num = num
            except ValueError:
                pass

    if not has_sequential:
        max_num = len(existing_admissions)

    return max_num + 1
