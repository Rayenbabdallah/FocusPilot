from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import logging

from app.database import get_db
from app.models.quiz import Quiz, SpacedRepetitionItem
from app.models.session import StudySession, Sprint
from app.models.student import Student
from app.services import quiz_engine

router = APIRouter(prefix="/api/quiz", tags=["quiz"])
logger = logging.getLogger(__name__)


# ─── Request bodies ────────────────────────────────────────────────────────────

class GenerateQuizBody(BaseModel):
    student_id: str
    session_id: str
    content_chunk_text: str


class SubmitAnswersBody(BaseModel):
    student_id: str
    answers: List[str]


class ReviewResultBody(BaseModel):
    student_id: str
    was_correct: bool


async def _ensure_student_exists(db: AsyncSession, student_id: str) -> None:
    result = await db.execute(select(Student).where(Student.id == student_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Student not found")


async def _ensure_session_owner(
    db: AsyncSession,
    session_id: str,
    student_id: str,
) -> None:
    result = await db.execute(
        select(StudySession).where(
            StudySession.id == session_id,
            StudySession.student_id == student_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found")


# ─── Routes ────────────────────────────────────────────────────────────────────

@router.post("/generate/{sprint_id}")
async def generate_quiz(
    sprint_id: str,
    body: GenerateQuizBody,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Generate 3 MCQ questions for a sprint's content chunk.

    Returns: {quiz_id, questions}
    """
    await _ensure_student_exists(db, body.student_id)
    await _ensure_session_owner(db, body.session_id, body.student_id)

    result = await db.execute(
        select(Sprint).where(Sprint.id == sprint_id, Sprint.session_id == body.session_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Sprint not found")

    try:
        quiz = await quiz_engine.create_sprint_quiz(
            db=db,
            sprint_id=sprint_id,
            session_id=body.session_id,
            content_chunk_text=body.content_chunk_text,
        )
        await db.commit()
        await db.refresh(quiz)
    except Exception:
        await db.rollback()
        logger.exception("Failed to generate quiz for sprint_id=%s", sprint_id)
        raise HTTPException(status_code=500, detail="Failed to generate quiz questions")

    return {
        "quiz_id": quiz.id,
        "questions": quiz.get_questions(),
    }


@router.post("/{quiz_id}/submit")
async def submit_quiz(
    quiz_id: str,
    body: SubmitAnswersBody,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Score submitted answers and update spaced repetition queue.

    Returns: {score, total, correct_indices, wrong_indices, explanations}
    """
    await _ensure_student_exists(db, body.student_id)

    result = await db.execute(
        select(Quiz)
        .join(StudySession, Quiz.session_id == StudySession.id)
        .where(Quiz.id == quiz_id, StudySession.student_id == body.student_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Quiz not found")

    try:
        scored = await quiz_engine.grade_quiz(
            db=db,
            quiz_id=quiz_id,
            student_answers=body.answers,
        )
        await db.commit()
        return scored
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        await db.rollback()
        logger.exception("Failed to grade quiz_id=%s", quiz_id)
        raise HTTPException(status_code=500, detail="Failed to grade quiz")


@router.get("/review/{student_id}")
async def get_review_queue(
    student_id: str,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Return spaced repetition items due for review today.

    Returns: {items_due, questions}
    """
    await _ensure_student_exists(db, student_id)
    try:
        questions = await quiz_engine.get_review_queue(db=db, student_id=student_id)
    except Exception:
        logger.exception("Failed to load review queue for student_id=%s", student_id)
        raise HTTPException(status_code=500, detail="Failed to load review queue")
    return {
        "items_due": len(questions),
        "questions": questions,
    }


@router.post("/review/{item_id}/result")
async def submit_review_result(
    item_id: str,
    body: ReviewResultBody,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Apply SM-2 update for a reviewed item.

    Returns: {next_review_at, message}
    """
    await _ensure_student_exists(db, body.student_id)
    item_result = await db.execute(
        select(SpacedRepetitionItem).where(
            SpacedRepetitionItem.id == item_id,
            SpacedRepetitionItem.student_id == body.student_id,
        )
    )
    if not item_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Review item not found")

    try:
        result = await quiz_engine.submit_review_result(
            db=db,
            item_id=item_id,
            was_correct=body.was_correct,
        )
        await db.commit()
        message = (
            f"Great job! Next review in {result['interval_days']} day(s)."
            if body.was_correct
            else f"Keep practising. Review again tomorrow."
        )
        return {
            "next_review_at": result["next_review_at"],
            "message": message,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        await db.rollback()
        logger.exception("Failed to submit review result for item_id=%s", item_id)
        raise HTTPException(status_code=500, detail="Failed to submit review result")
