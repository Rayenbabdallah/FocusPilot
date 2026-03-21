from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.material import Material
from app.models.quiz import Quiz
from app.models.session import Sprint, StudySession
from app.models.student import Student
from app.services import session_engine
from app.services.bedrock import BedrockService

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


# ─── Request bodies ────────────────────────────────────────────────────────────

class StartSessionBody(BaseModel):
    student_id: str
    goal: str
    material_ids: List[str]
    available_minutes: int = 90


class CompleteSprintBody(BaseModel):
    quiz_score: float = 0.0
    topics_covered: List[str] = []


class DriftBody(BaseModel):
    sprint_id: str
    signal_type: str


class TutorBody(BaseModel):
    question: str
    current_content: str = ""
    conversation_history: List[Dict[str, str]] = []


class ReexplainBody(BaseModel):
    chunk_text: str


# ─── Routes ────────────────────────────────────────────────────────────────────

@router.get("/active/{student_id}")
async def get_active_session(
    student_id: str,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any] | None:
    """Return the active session for a student, or null if none exists (200 either way)."""
    result = await db.execute(
        select(StudySession)
        .where(StudySession.student_id == student_id, StudySession.status == "active")
        .order_by(StudySession.started_at.desc())
    )
    session = result.scalar_one_or_none()
    if not session:
        return None
    return {
        "session_id": session.id,
        "student_id": session.student_id,
        "goal": session.goal,
        "status": session.status,
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "ended_at": session.ended_at.isoformat() if session.ended_at else None,
    }


@router.post("/start")
async def start_session(
    body: StartSessionBody,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Plan and create a new study session.

    Returns: {session_id, plan, first_task, first_sprint_id, first_chunk}
    """
    result = await db.execute(select(Student).where(Student.id == body.student_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Student not found")

    try:
        data = await session_engine.kickoff_session(
            db=db,
            student_id=body.student_id,
            goal=body.goal,
            material_ids=body.material_ids,
            available_minutes=body.available_minutes,
        )
        await db.commit()
        return data
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{session_id}/sprint/{sprint_id}/start")
async def start_sprint(
    session_id: str,
    sprint_id: str,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Mark a sprint as active and return its content chunk.

    Returns: {sprint_id, chunk, sprint_number, objective, duration_minutes}
    """
    from datetime import datetime

    result = await db.execute(
        select(Sprint).where(Sprint.id == sprint_id, Sprint.session_id == session_id)
    )
    sprint = result.scalar_one_or_none()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    try:
        sprint.status = "active"
        sprint.started_at = datetime.utcnow()
        chunk = await session_engine.get_sprint_chunk(db, sprint_id)
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail={"error": str(e), "context": "Failed to start sprint"},
        )

    return {
        "sprint_id": sprint.id,
        "chunk": chunk,
        "sprint_number": sprint.sprint_number,
        "objective": chunk.get("title", f"Sprint {sprint.sprint_number + 1}"),
        "duration_minutes": sprint.duration_minutes,
    }


@router.post("/{session_id}/sprint/{sprint_id}/complete")
async def complete_sprint(
    session_id: str,
    sprint_id: str,
    body: CompleteSprintBody,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Mark sprint completed and get retention snapshot + next sprint info.

    Returns: {retention_snapshot, next_sprint_id, is_session_done}
    """
    result = await db.execute(
        select(Sprint).where(Sprint.id == sprint_id, Sprint.session_id == session_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Sprint not found")

    try:
        data = await session_engine.complete_sprint(
            db=db,
            sprint_id=sprint_id,
            quiz_score=body.quiz_score,
            topics_covered=body.topics_covered,
        )
        await db.commit()
        return data
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{session_id}/drift")
async def record_drift(
    session_id: str,
    body: DriftBody,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Record a drift event and return a re-anchor question.

    Returns: {reanchor_question}
    """
    result = await db.execute(select(StudySession).where(StudySession.id == session_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        reanchor_question = await session_engine.log_drift(
            db=db,
            session_id=session_id,
            sprint_id=body.sprint_id,
            signal_type=body.signal_type,
        )
        await db.commit()
    except Exception as e:
        await db.rollback()
        # Drift logging must never crash the session — return a safe fallback
        reanchor_question = "What was the last concept you were reading about?"
    return {"reanchor_question": reanchor_question}


@router.post("/{session_id}/tutor")
async def tutor_chat(
    session_id: str,
    body: TutorBody,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Context-aware AI tutor response for the current sprint content.

    Returns: {answer}
    """
    result = await db.execute(select(StudySession).where(StudySession.id == session_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        bedrock = BedrockService()
        answer = await bedrock.generate_ai_tutor_response(
            question=body.question,
            current_content=body.current_content,
            conversation_history=body.conversation_history,
        )
    except Exception as e:
        answer = "I'm having trouble connecting right now. Try rephrasing your question or reviewing the content directly."
    return {"answer": answer}


@router.post("/{session_id}/reexplain")
async def reexplain_content(
    session_id: str,
    body: ReexplainBody,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, str]:
    """Re-explain the current chunk from a different angle for a confused student."""
    result = await db.execute(select(StudySession).where(StudySession.id == session_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found")
    bedrock = BedrockService()
    explanation = await bedrock.reexplain_chunk(body.chunk_text)
    return {"explanation": explanation}


@router.post("/{session_id}/close")
async def close_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Mark session complete, compute stats, update profile.

    Returns: {total_time_minutes, avg_score, topics_covered, final_snapshot, sessions_streak}
    """
    result = await db.execute(select(StudySession).where(StudySession.id == session_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        data = await session_engine.close_session(db=db, session_id=session_id)
        return data
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"error": str(e), "context": "Failed to close session"},
        )


@router.get("/active/{student_id}")
async def get_active_session(
    student_id: str,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Return the most recent active session for a student, if any.

    Returns: {session_id, student_id, goal, status, started_at, plan, first_sprint_id}
    or 404 if no active session exists.
    """
    result = await db.execute(
        select(StudySession)
        .where(StudySession.student_id == student_id, StudySession.status == "active")
        .order_by(StudySession.started_at.desc())
        .limit(1)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="No active session")

    planned = session.get_planned_sprints()
    plan = {"sprints": planned, "total_sprints": len(planned)}

    # Find first pending sprint
    sprint_result = await db.execute(
        select(Sprint)
        .where(Sprint.session_id == session.id, Sprint.status == "pending")
        .order_by(Sprint.sprint_number.asc())
        .limit(1)
    )
    pending_sprint = sprint_result.scalar_one_or_none()

    return {
        "session_id": session.id,
        "student_id": session.student_id,
        "goal": session.goal,
        "status": session.status,
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "ended_at": session.ended_at.isoformat() if session.ended_at else None,
        "plan": plan,
        "first_sprint_id": pending_sprint.id if pending_sprint else None,
    }


@router.get("/{student_id}/history")
async def session_history(
    student_id: str,
    db: AsyncSession = Depends(get_db),
) -> List[Dict[str, Any]]:
    """
    Return past sessions for a student.

    Returns: [{session_id, goal, started_at, ended_at, total_sprints, avg_score, status}]
    """
    result = await db.execute(
        select(StudySession)
        .where(StudySession.student_id == student_id)
        .order_by(StudySession.started_at.desc())
        .limit(50)
    )
    sessions = result.scalars().all()

    history: list[dict] = []
    for sess in sessions:
        # Sprint count
        sprint_result = await db.execute(
            select(Sprint).where(Sprint.session_id == sess.id)
        )
        sprints = sprint_result.scalars().all()

        # Average quiz score
        quiz_result = await db.execute(
            select(Quiz).where(Quiz.session_id == sess.id, Quiz.score.isnot(None))
        )
        quizzes = quiz_result.scalars().all()
        scores = [q.score for q in quizzes if q.score is not None]
        avg_score = round(sum(scores) / len(scores), 1) if scores else None

        # Materials covered in this session
        material_ids = list({s.material_id for s in sprints if s.material_id})
        materials_covered: list[dict] = []
        if material_ids:
            mat_result = await db.execute(
                select(Material).where(Material.id.in_(material_ids))
            )
            mats = mat_result.scalars().all()
            materials_covered = [{"id": m.id, "title": m.title, "subject": m.subject} for m in mats]

        history.append(
            {
                "session_id": sess.id,
                "goal": sess.goal,
                "started_at": sess.started_at.isoformat() if sess.started_at else None,
                "ended_at": sess.ended_at.isoformat() if sess.ended_at else None,
                "total_sprints": len(sprints),
                "avg_score": avg_score,
                "status": sess.status,
                "materials_covered": materials_covered,
            }
        )
    return history
