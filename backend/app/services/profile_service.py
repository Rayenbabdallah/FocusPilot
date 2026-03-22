from __future__ import annotations

import logging
import uuid
from datetime import datetime

from sqlalchemy import func, select

from app.models.profile import LearningProfile

logger = logging.getLogger(__name__)


async def get_or_create_profile(db, student_id: str) -> LearningProfile:
    """Fetch the LearningProfile for student_id, creating it if absent."""
    result = await db.execute(
        select(LearningProfile).where(LearningProfile.student_id == student_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        profile = LearningProfile(
            id=str(uuid.uuid4()),
            student_id=student_id,
            updated_at=datetime.utcnow(),
        )
        db.add(profile)
        await db.flush()
    return profile


async def update_profile_after_session(
    db,
    student_id: str,
    session_id: str,
) -> LearningProfile:
    """
    Recalculate the LearningProfile from the last 10 sessions, using Bedrock
    to identify patterns, then persist and return the updated profile.
    """
    from app.models.quiz import Quiz, SpacedRepetitionItem
    from app.models.session import DriftEvent, Sprint, StudySession
    from app.services.bedrock import BedrockService

    profile = await get_or_create_profile(db, student_id)

    # ── Load the completed session ───────────────────────────────────────────
    sess_result = await db.execute(
        select(StudySession).where(StudySession.id == session_id)
    )
    session = sess_result.scalar_one_or_none()

    # ── Build session_history from last 10 completed sessions ────────────────
    hist_result = await db.execute(
        select(StudySession)
        .where(
            StudySession.student_id == student_id,
            StudySession.status == "completed",
        )
        .order_by(StudySession.started_at.desc())
        .limit(10)
    )
    past_sessions = hist_result.scalars().all()

    session_history: list[dict] = []
    for s in past_sessions:
        duration = 0
        if s.started_at and s.ended_at:
            duration = int((s.ended_at - s.started_at).total_seconds() / 60)

        # Quiz scores for this session
        q_result = await db.execute(
            select(Quiz).where(Quiz.session_id == s.id, Quiz.score.isnot(None))
        )
        qs = q_result.scalars().all()
        scores = [q.score for q in qs if q.score is not None]
        avg_score = round(sum(scores) / len(scores), 1) if scores else None

        # Drift count
        drift_result = await db.execute(
            select(DriftEvent).where(DriftEvent.session_id == s.id)
        )
        drifts = drift_result.scalars().all()

        session_history.append(
            {
                "session_id": s.id,
                "goal": s.goal,
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "duration_minutes": duration,
                "avg_quiz_score": avg_score,
                "drift_count": len(drifts),
            }
        )

    # ── Call Bedrock for pattern analysis ────────────────────────────────────
    current_profile_dict = {
        "avg_focus_duration_minutes": profile.avg_focus_duration_minutes,
        "best_focus_time_of_day": profile.best_focus_time_of_day,
        "preferred_content_format": profile.preferred_content_format,
        "weak_topics": profile.get_weak_topics(),
        "total_sessions": profile.total_sessions,
    }

    bedrock = BedrockService()
    analysis = await bedrock.analyze_learning_profile(session_history, current_profile_dict)

    # ── Apply AI suggestions ─────────────────────────────────────────────────
    if analysis.get("best_focus_time_of_day"):
        profile.best_focus_time_of_day = analysis["best_focus_time_of_day"]
    if analysis.get("preferred_content_format"):
        profile.preferred_content_format = analysis["preferred_content_format"]
    if isinstance(analysis.get("weak_topics"), list):
        existing = set(profile.get_weak_topics())
        merged = list(existing | set(analysis["weak_topics"]))
        profile.set_weak_topics(merged[:10])

    # ── Recalculate focus duration from this session's completed sprints ─────
    if session:
        sprint_result = await db.execute(
            select(Sprint).where(
                Sprint.session_id == session_id, Sprint.status == "completed"
            )
        )
        completed_sprints = sprint_result.scalars().all()
        focus_durations = [
            (s.ended_at - s.started_at).total_seconds() / 60
            for s in completed_sprints
            if s.started_at and s.ended_at
        ]
        if focus_durations:
            session_avg = sum(focus_durations) / len(focus_durations)
            if profile.total_sessions > 0:
                profile.avg_focus_duration_minutes = round(
                    profile.avg_focus_duration_minutes * 0.8 + session_avg * 0.2, 2
                )
            else:
                profile.avg_focus_duration_minutes = round(session_avg, 2)

        # Total time for this session
        session_minutes = 0
        if session.started_at and session.ended_at:
            session_minutes = int(
                (session.ended_at - session.started_at).total_seconds() / 60
            )
        profile.total_study_minutes += session_minutes

    profile.total_sessions += 1
    profile.updated_at = datetime.utcnow()
    await db.flush()
    return profile


async def get_profile_stats(db, student_id: str) -> dict:
    """
    Return aggregated stats for the student's profile page.

    Returns:
        {total_sessions, total_study_minutes, avg_retention_score,
         items_due_for_review, topics_mastered_count, sessions_streak}
    """
    from app.models.quiz import Quiz, SpacedRepetitionItem
    from app.models.session import StudySession

    profile = await get_or_create_profile(db, student_id)

    # Average quiz score across all completed quizzes
    score_result = await db.execute(
        select(func.avg(Quiz.score))
        .join(StudySession, Quiz.session_id == StudySession.id)
        .where(
            StudySession.student_id == student_id,
            Quiz.score.isnot(None),
        )
    )
    avg_score_row = score_result.scalar()
    avg_retention_score = round(float(avg_score_row), 1) if avg_score_row else 0.0

    # Items due for review
    due_result = await db.execute(
        select(func.count(SpacedRepetitionItem.id)).where(
            SpacedRepetitionItem.student_id == student_id,
            SpacedRepetitionItem.next_review_at <= datetime.utcnow(),
        )
    )
    items_due = due_result.scalar() or 0

    # Topics "mastered" = items with ease_factor >= 2.5 and times_correct >= 3
    mastered_result = await db.execute(
        select(func.count(SpacedRepetitionItem.id)).where(
            SpacedRepetitionItem.student_id == student_id,
            SpacedRepetitionItem.ease_factor >= DEFAULT_EASE_FACTOR,
            SpacedRepetitionItem.times_correct >= 3,
        )
    )
    topics_mastered = mastered_result.scalar() or 0

    # Sessions streak — count any day where at least one sprint was completed
    # (not just fully-closed sessions; partial completion counts for ADHD users)
    from app.models.session import Sprint, StudySession
    streak_result = await db.execute(
        select(Sprint)
        .join(StudySession, Sprint.session_id == StudySession.id)
        .where(
            StudySession.student_id == student_id,
            Sprint.status == "completed",
            Sprint.ended_at.isnot(None),
        )
        .order_by(Sprint.ended_at.desc())
        .limit(60)
    )
    completed_sprints = streak_result.scalars().all()
    sessions_streak = _calculate_streak_from_sprints(completed_sprints)
    best_streak = _calculate_best_streak(completed_sprints)
    last_study_days_ago = _days_since_last_sprint(completed_sprints)

    return {
        "total_sessions": profile.total_sessions,
        "total_study_minutes": profile.total_study_minutes,
        "avg_retention_score": avg_retention_score,
        "items_due_for_review": int(items_due),
        "topics_mastered_count": int(topics_mastered),
        "sessions_streak": sessions_streak,
        "best_streak": best_streak,
        "last_study_days_ago": last_study_days_ago,
    }


def _calculate_streak(sessions: list) -> int:
    """Count consecutive calendar days that have at least one completed session."""
    from datetime import date, timedelta
    if not sessions:
        return 0
    day_set = {s.ended_at.date() for s in sessions if s.ended_at}
    streak = 0
    current = date.today()
    for _ in range(30):
        if current in day_set:
            streak += 1
            current -= timedelta(days=1)
        else:
            break
    return streak


def _days_since_last_sprint(sprints: list) -> int | None:
    """Return how many days ago the most recent completed sprint was, or None if never."""
    from datetime import date
    dates = [s.ended_at.date() for s in sprints if s.ended_at]
    if not dates:
        return None
    return (date.today() - max(dates)).days


def _calculate_best_streak(sprints: list) -> int:
    """Return the longest consecutive-day run across all completed sprints."""
    from datetime import timedelta
    if not sprints:
        return 0
    day_set = sorted({s.ended_at.date() for s in sprints if s.ended_at})
    best = current = 1
    for i in range(1, len(day_set)):
        if day_set[i] - day_set[i - 1] == timedelta(days=1):
            current += 1
            best = max(best, current)
        else:
            current = 1
    return best


def _calculate_streak_from_sprints(sprints: list) -> int:
    """Count consecutive calendar days that have at least one completed sprint."""
    from datetime import date, timedelta
    if not sprints:
        return 0
    day_set = {s.ended_at.date() for s in sprints if s.ended_at}
    streak = 0
    # Allow streak to include today OR yesterday as the most recent day
    # (so a streak isn't broken just because you haven't studied yet today)
    current = date.today()
    if current not in day_set:
        yesterday = current - timedelta(days=1)
        if yesterday in day_set:
            current = yesterday
        else:
            return 0
    for _ in range(60):
        if current in day_set:
            streak += 1
            current -= timedelta(days=1)
        else:
            break
    return streak


# Re-export constant for use in stats query
DEFAULT_EASE_FACTOR = 2.5
