from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.profile import LearningProfileRead
from app.models.student import Student
from app.services.profile_service import get_or_create_profile, get_profile_stats

router = APIRouter(prefix="/api/profile", tags=["profile"])

DEFAULT_STUDENT_ID = "00000000-0000-0000-0000-000000000001"


@router.get("/{student_id}")
async def get_profile(
    student_id: str,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Return the full LearningProfile combined with aggregated stats.

    Returns: profile fields + stats: {total_sessions, total_study_minutes,
             avg_retention_score, items_due_for_review, topics_mastered_count}
    """
    # Auto-create default student on first access
    if student_id == DEFAULT_STUDENT_ID:
        await _ensure_default_student(db, student_id)

    result = await db.execute(select(Student).where(Student.id == student_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Student not found")

    try:
        profile = await get_or_create_profile(db, student_id)
        await db.commit()
        stats = await get_profile_stats(db, student_id)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"error": str(e), "context": "Failed to load profile"},
        )

    profile_data = LearningProfileRead.from_orm_parsed(profile).model_dump()
    profile_data["stats"] = stats
    return profile_data


async def _ensure_default_student(db: AsyncSession, student_id: str) -> None:
    from datetime import datetime
    result = await db.execute(select(Student).where(Student.id == student_id))
    if not result.scalar_one_or_none():
        student = Student(
            id=student_id,
            name="Default Student",
            email=f"student_{student_id[:8]}@focuspilot.app",
            created_at=datetime.utcnow(),
        )
        db.add(student)
        await db.flush()
