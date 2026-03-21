from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta
from typing import Tuple

from sqlalchemy import select

logger = logging.getLogger(__name__)

DEFAULT_EASE_FACTOR = 2.5
MIN_EASE_FACTOR = 1.3


async def create_sprint_quiz(
    db,
    sprint_id: str,
    session_id: str,
    content_chunk_text: str,
):
    """
    Generate 3 MCQ questions for the given content chunk and persist a Quiz record.

    Returns:
        Quiz ORM object (not yet committed — caller must commit).
    """
    from app.models.quiz import Quiz
    from app.services.bedrock import BedrockService

    bedrock = BedrockService()
    questions = await bedrock.generate_quiz_questions(content_chunk_text, num_questions=3)

    quiz = Quiz(
        id=str(uuid.uuid4()),
        sprint_id=sprint_id,
        session_id=session_id,
    )
    quiz.set_questions(questions)
    db.add(quiz)
    await db.flush()
    return quiz


async def grade_quiz(
    db,
    quiz_id: str,
    student_answers: list[str],
) -> dict:
    """
    Score submitted answers, persist results, and upsert SpacedRepetitionItems
    for wrong answers.

    Returns:
        {score, total, correct_indices, wrong_indices, explanations}
    """
    from app.models.quiz import Quiz, SpacedRepetitionItem
    from app.models.session import StudySession

    result = await db.execute(select(Quiz).where(Quiz.id == quiz_id))
    quiz = result.scalar_one_or_none()
    if not quiz:
        raise ValueError(f"Quiz {quiz_id} not found")

    questions = quiz.get_questions()
    correct_indices: list[int] = []
    wrong_indices: list[int] = []
    explanations: list[str] = []

    for i, question in enumerate(questions):
        user_answer = student_answers[i].strip().upper()[:1] if i < len(student_answers) else ""
        correct_answer = str(question.get("correct_answer", "A")).strip().upper()[:1]
        is_correct = user_answer == correct_answer

        if is_correct:
            correct_indices.append(i)
            explanations.append(question.get("explanation", "Correct!"))
        else:
            wrong_indices.append(i)
            explanations.append(
                question.get(
                    "explanation",
                    f"The correct answer is {correct_answer}. Review this concept.",
                )
            )

    total = len(questions)
    score_pct = round(len(correct_indices) / total * 100, 1) if total > 0 else 0.0

    quiz.set_answers(student_answers)
    quiz.score = score_pct
    quiz.completed_at = datetime.utcnow()
    await db.flush()

    # Resolve student_id from the session
    sess_result = await db.execute(
        select(StudySession).where(StudySession.id == quiz.session_id)
    )
    session = sess_result.scalar_one_or_none()
    student_id: str | None = session.student_id if session else None

    if student_id:
        await _upsert_spaced_repetition(db, quiz, questions, wrong_indices, student_id)

    return {
        "score": score_pct,
        "total": total,
        "correct_indices": correct_indices,
        "wrong_indices": wrong_indices,
        "explanations": explanations,
    }


async def get_review_queue(db, student_id: str) -> list[dict]:
    """
    Return up to 20 SpacedRepetitionItems due today, ordered by ease_factor ASC
    (hardest items first).

    Each dict contains the question data plus the item id and scheduling info.
    """
    from app.models.quiz import SpacedRepetitionItem

    result = await db.execute(
        select(SpacedRepetitionItem)
        .where(
            SpacedRepetitionItem.student_id == student_id,
            SpacedRepetitionItem.next_review_at <= datetime.utcnow(),
        )
        .order_by(SpacedRepetitionItem.ease_factor.asc())
        .limit(20)
    )
    items = result.scalars().all()

    queue: list[dict] = []
    for item in items:
        q = item.get_question()
        queue.append(
            {
                "item_id": item.id,
                "ease_factor": item.ease_factor,
                "interval_days": item.interval_days,
                "times_correct": item.times_correct,
                "times_wrong": item.times_wrong,
                "next_review_at": item.next_review_at.isoformat(),
                **q,
            }
        )
    return queue


async def submit_review_result(
    db,
    item_id: str,
    was_correct: bool,
) -> dict:
    """
    Apply the simplified SM-2 update and persist.

    Returns:
        {next_review_at, interval_days, ease_factor}
    """
    from app.models.quiz import SpacedRepetitionItem

    result = await db.execute(
        select(SpacedRepetitionItem).where(SpacedRepetitionItem.id == item_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise ValueError(f"SpacedRepetitionItem {item_id} not found")

    if was_correct:
        new_interval = max(1, round(item.interval_days * item.ease_factor))
        new_ef = min(DEFAULT_EASE_FACTOR, item.ease_factor + 0.1)
        item.times_correct += 1
    else:
        new_interval = 1
        new_ef = max(MIN_EASE_FACTOR, item.ease_factor - 0.2)
        item.times_wrong += 1

    item.interval_days = new_interval
    item.ease_factor = round(new_ef, 4)
    item.last_reviewed_at = datetime.utcnow()
    item.next_review_at = datetime.utcnow() + timedelta(days=new_interval)
    await db.flush()

    return {
        "next_review_at": item.next_review_at.isoformat(),
        "interval_days": item.interval_days,
        "ease_factor": item.ease_factor,
    }


# ─── Helpers ───────────────────────────────────────────────────────────────────

async def _upsert_spaced_repetition(
    db,
    quiz,
    questions: list[dict],
    wrong_indices: list[int],
    student_id: str,
) -> None:
    """Create or update SpacedRepetitionItems for wrong-answered questions."""
    from app.models.quiz import SpacedRepetitionItem

    for i in wrong_indices:
        if i >= len(questions):
            continue
        question = questions[i]
        question_text = question.get("question", "")

        # Try to find an existing item by question text prefix (first 50 chars)
        prefix = question_text[:50]
        existing_result = await db.execute(
            select(SpacedRepetitionItem).where(
                SpacedRepetitionItem.student_id == student_id,
                SpacedRepetitionItem.question.contains(prefix),
            )
        )
        item = existing_result.scalar_one_or_none()

        question_data = {
            "question": question_text,
            "options": question.get("options", []),
            "correct_answer": question.get("correct_answer", ""),
            "explanation": question.get("explanation", ""),
        }

        if item:
            # Penalise — lower ease factor, reset interval
            new_ef = max(MIN_EASE_FACTOR, item.ease_factor - 0.2)
            item.ease_factor = round(new_ef, 4)
            item.interval_days = 1
            item.times_wrong += 1
            item.last_reviewed_at = datetime.utcnow()
            item.next_review_at = datetime.utcnow() + timedelta(days=1)
        else:
            new_item = SpacedRepetitionItem(
                id=str(uuid.uuid4()),
                student_id=student_id,
                ease_factor=DEFAULT_EASE_FACTOR,
                interval_days=1,
                next_review_at=datetime.utcnow() + timedelta(days=1),
                times_wrong=1,
            )
            new_item.set_question(question_data)
            # Link to source material if available
            if hasattr(quiz, "sprint_id"):
                pass  # could resolve material_id via sprint if needed
            db.add(new_item)

    await db.flush()
