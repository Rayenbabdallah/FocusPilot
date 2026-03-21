from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.quiz import Quiz
from app.services import quiz_engine

router = APIRouter(prefix="/api/quiz", tags=["quiz"])


# ─── Request bodies ────────────────────────────────────────────────────────────

class GenerateQuizBody(BaseModel):
    session_id: str
    content_chunk_text: str


class SubmitAnswersBody(BaseModel):
    answers: List[str]


class ReviewResultBody(BaseModel):
    was_correct: bool


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
    from app.models.session import Sprint

    result = await db.execute(select(Sprint).where(Sprint.id == sprint_id))
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
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail={"error": str(e), "context": "Failed to generate quiz questions"},
        )

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
    result = await db.execute(select(Quiz).where(Quiz.id == quiz_id))
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
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail={"error": str(e), "context": "Failed to grade quiz"},
        )


@router.get("/review/{student_id}")
async def get_review_queue(
    student_id: str,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Return spaced repetition items due for review today.

    Returns: {items_due, questions}
    """
    try:
        questions = await quiz_engine.get_review_queue(db=db, student_id=student_id)
    except Exception:
        questions = []
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
