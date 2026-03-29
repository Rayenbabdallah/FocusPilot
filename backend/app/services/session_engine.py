from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import select

from app.models.material import Material
from app.models.session import DriftEvent, Sprint, StudySession

logger = logging.getLogger(__name__)


def _fallback_chunk_from_raw_text(raw_text: str, fallback_index: int = 0) -> dict | None:
    """
    Build a minimal chunk when AI chunking/reformatting is unavailable.
    Uses the first ~900 words to keep sprint payloads bounded.
    """
    text = (raw_text or "").strip()
    if not text:
        return None
    words = text.split()
    clipped = " ".join(words[:900])
    wc = len(clipped.split())
    return {
        "index": fallback_index,
        "text": clipped,
        "original_text": clipped,
        "word_count": wc,
    }


def _is_generic_template_text(text: str) -> bool:
    lowered = str(text or "").lower()
    if not lowered.strip():
        return False
    # Only flag text that contains phrases exclusive to the old generic fallback
    # template — NOT phrases that appear in our own well-structured prompt output.
    # "what you'll learn" and "the concept" were removed because they are required
    # section headers in our Bedrock reformat prompt and would incorrectly flag
    # good AI output as boilerplate.
    if "this section introduces the key concepts in your study material" in lowered:
        return True
    generic_markers = (
        "think of it like a recipe",
        "core idea:",
        "real-world applications of this concept",
    )
    return sum(1 for marker in generic_markers if marker in lowered) >= 2


def _raw_text_slice(raw_text: str, chunk_index: int, chunk_size_words: int = 900, overlap_words: int = 100) -> str:
    words = (raw_text or "").split()
    if not words:
        return ""
    stride = max(1, chunk_size_words - overlap_words)
    start = max(0, chunk_index) * stride
    if start >= len(words):
        start = max(0, len(words) - chunk_size_words)
    end = min(len(words), start + chunk_size_words)
    return " ".join(words[start:end]).strip()


def _normalize_chunk_for_display(chunk: dict) -> dict:
    """
    Ensure sprint content stays faithful to the source material.
    Keep AI reformatting when it's good, but reject known generic fallback boilerplate.
    """
    if not isinstance(chunk, dict):
        return {}

    text = str(chunk.get("text", "") or "")
    original = str(chunk.get("original_text", "") or "")
    lowered = text.lower()

    looks_like_ai_error = lowered.startswith("[ai temporarily unavailable") or lowered.startswith("[ai error")
    looks_like_generic_boilerplate = _is_generic_template_text(text)

    if original and (looks_like_ai_error or looks_like_generic_boilerplate):
        fixed = dict(chunk)
        fixed["text"] = original
        return fixed
    return chunk


async def kickoff_session(
    db,
    student_id: str,
    goal: str,
    material_ids: list[str],
    available_minutes: int,
) -> dict:
    """
    Build an AI-planned study session from selected materials.

    Returns:
        {session_id, plan, first_task, first_sprint_id, first_chunk}
    """
    from app.services.bedrock import BedrockService

    # ── Abandon any existing active sessions for this student ───────────────
    existing = await db.execute(
        select(StudySession).where(
            StudySession.student_id == student_id,
            StudySession.status == "active",
        )
    )
    for old in existing.scalars().all():
        old.status = "abandoned"
    await db.flush()

    # ── Fetch materials ──────────────────────────────────────────────────────
    materials: list[Material] = []
    seen_material_ids: set[str] = set()
    for mid in material_ids:
        if mid in seen_material_ids:
            continue
        seen_material_ids.add(mid)
        result = await db.execute(
            select(Material).where(
                Material.id == mid,
                Material.student_id == student_id,
            )
        )
        mat = result.scalar_one_or_none()
        if mat:
            materials.append(mat)
    if not materials:
        raise ValueError("No valid materials found for this student")

    # ── Build summary string (all sections, not just first chunk) ───────────
    summary_parts: list[str] = []
    for mat in materials:
        chunks = mat.get_chunks()
        if chunks and isinstance(chunks, list):
            # Extract the first line of each chunk as a section headline
            section_lines: list[str] = []
            for i, chunk in enumerate(chunks):
                if not isinstance(chunk, dict):
                    continue
                chunk_text = chunk.get("text", "")
                # Try to find a heading line (## or bold or first sentence)
                heading = ""
                for line in chunk_text.splitlines():
                    line = line.strip()
                    if line.startswith("#"):
                        heading = line.lstrip("#").strip()
                        break
                    if line and not heading:
                        # Use first non-empty line as fallback, truncated
                        heading = line[:80]
                if heading:
                    section_lines.append(f"  {i + 1}. {heading}")
            sections_text = "\n".join(section_lines) if section_lines else "  (no sections extracted)"
            summary_parts.append(
                f"Material: {mat.title} ({mat.type}) — {len(chunks)} sections:\n{sections_text}"
            )
        elif mat.raw_text:
            preview = mat.raw_text[:400]
            summary_parts.append(f"Material: {mat.title} ({mat.type}):\n  {preview}…")
    materials_summary = "\n\n".join(summary_parts) or "No materials provided."

    # ── Generate AI plan ─────────────────────────────────────────────────────
    bedrock = BedrockService()
    plan = await bedrock.generate_session_plan(
        goal=goal,
        materials_summary=materials_summary,
        available_minutes=available_minutes,
    )
    sprint_plans: list[dict] = plan.get("sprints", [])

    # ── Collect all content chunks across materials ──────────────────────────
    chunks_by_material: list[tuple[Material, list[dict]]] = []
    for mat in materials:
        material_chunks: list[dict] = []
        for chunk in mat.get_chunks() or []:
            if isinstance(chunk, dict):
                material_chunks.append(
                    {
                        "material_id": mat.id,
                        "material_title": mat.title,
                        **chunk,
                    }
                )
        if not material_chunks:
            fallback = _fallback_chunk_from_raw_text(mat.raw_text or "", 0)
            if fallback:
                material_chunks.append(
                    {
                        "material_id": mat.id,
                        "material_title": mat.title,
                        **fallback,
                    }
                )
        if material_chunks:
            chunks_by_material.append((mat, material_chunks))

    if not chunks_by_material:
        raise ValueError("Selected materials contain no readable content")

    # ── Persist StudySession ─────────────────────────────────────────────────
    session = StudySession(
        id=str(uuid.uuid4()),
        student_id=student_id,
        goal=goal,
        status="active",
        started_at=datetime.utcnow(),
    )
    session.set_planned_sprints(sprint_plans)
    db.add(session)
    await db.flush()

    # ── Create Sprint records ────────────────────────────────────────────────
    # Round-robin across selected materials so early sprints cover selections.
    sprints: list[Sprint] = []
    for i, sp in enumerate(sprint_plans):
        if chunks_by_material:
            mat_idx = i % len(chunks_by_material)
            chunk_round = i // len(chunks_by_material)
            mat, material_chunks = chunks_by_material[mat_idx]
            chunk_data = material_chunks[min(chunk_round, len(material_chunks) - 1)]
            material_id: str | None = mat.id
        else:
            chunk_data = {"text": sp.get("focus", goal), "material_title": "", "word_count": 0}
            material_id = material_ids[0] if material_ids else None

        sprint = Sprint(
            id=str(uuid.uuid4()),
            session_id=session.id,
            material_id=material_id,
            sprint_number=i,
            duration_minutes=sp.get("duration_minutes", 15),
            status="pending",
        )
        sprint.set_content_chunk(
            {
                "index": chunk_data.get("index", i),
                "text": _normalize_chunk_for_display(chunk_data).get("text", sp.get("focus", "")),
                "original_text": chunk_data.get("original_text"),
                "material_title": chunk_data.get("material_title", ""),
                "title": sp.get("title", f"Sprint {i + 1}"),
                "word_count": chunk_data.get("word_count", 0),
            }
        )
        db.add(sprint)
        sprints.append(sprint)

    await db.flush()

    first_sprint = sprints[0] if sprints else None
    first_chunk = first_sprint.get_content_chunk() if first_sprint else {}
    first_task = sprint_plans[0].get("title", goal) if sprint_plans else goal

    return {
        "session_id": session.id,
        "plan": plan,
        "first_task": first_task,
        "first_sprint_id": first_sprint.id if first_sprint else None,
        "first_chunk": first_chunk,
        "materials_used": [{"id": m.id, "title": m.title} for m in materials],
    }


async def get_sprint_chunk(db, sprint_id: str) -> dict:
    """
    Return the content chunk for a sprint, pulling from the material's
    processed_chunks when available (falls back to sprint's stored chunk).
    """
    result = await db.execute(select(Sprint).where(Sprint.id == sprint_id))
    sprint = result.scalar_one_or_none()
    if not sprint:
        return {}

    if not sprint.material_id:
        return _normalize_chunk_for_display(sprint.get_content_chunk())

    mat_result = await db.execute(select(Material).where(Material.id == sprint.material_id))
    material = mat_result.scalar_one_or_none()
    if not material:
        return _normalize_chunk_for_display(sprint.get_content_chunk())

    chunks = material.get_chunks()
    if not isinstance(chunks, list) or not chunks:
        return _normalize_chunk_for_display(sprint.get_content_chunk())

    # Use the stored chunk index (correct for multi-material sessions),
    # falling back to sprint_number only if index isn't stored yet.
    stored = sprint.get_content_chunk()
    target = stored.get("index", sprint.sprint_number)

    def _with_raw_fallback(candidate: dict, idx: int) -> dict:
        normalized = _normalize_chunk_for_display(candidate)
        text = str(normalized.get("text", "") or "")
        if _is_generic_template_text(text):
            raw_slice = _raw_text_slice(material.raw_text or "", idx)
            if raw_slice:
                fixed = dict(normalized)
                fixed["text"] = raw_slice
                fixed["original_text"] = raw_slice
                fixed["word_count"] = len(raw_slice.split())
                return fixed
        return normalized

    if isinstance(target, int) and 0 <= target < len(chunks):
        c = chunks[target]
        return _with_raw_fallback(c, target) if isinstance(c, dict) else sprint.get_content_chunk()

    # Out of range → return last chunk
    last = chunks[-1]
    return _with_raw_fallback(last, len(chunks) - 1) if isinstance(last, dict) else sprint.get_content_chunk()


async def complete_sprint(
    db,
    sprint_id: str,
    quiz_score: float,
    topics_covered: list[str],
) -> dict:
    """
    Mark sprint completed and return:
        {retention_snapshot, next_sprint_id, is_session_done}
    """
    from app.services.bedrock import BedrockService

    result = await db.execute(select(Sprint).where(Sprint.id == sprint_id))
    sprint = result.scalar_one_or_none()
    if not sprint:
        raise ValueError(f"Sprint {sprint_id} not found")

    sprint.status = "completed"
    sprint.ended_at = datetime.utcnow()
    await db.flush()

    # Build session-level results for the snapshot
    all_result = await db.execute(
        select(Sprint).where(Sprint.session_id == sprint.session_id)
    )
    all_sprints = all_result.scalars().all()

    session_results = [
        {
            "sprint_number": s.sprint_number,
            "status": s.status,
            "duration_minutes": s.duration_minutes,
            **(
                {"score": quiz_score, "topics_covered": topics_covered}
                if s.sprint_number == sprint.sprint_number
                else {}
            ),
        }
        for s in all_sprints
    ]

    bedrock = BedrockService()
    retention_snapshot = await bedrock.generate_retention_snapshot(session_results)

    pending = sorted(
        [s for s in all_sprints if s.status == "pending"],
        key=lambda s: s.sprint_number,
    )
    next_sprint = pending[0] if pending else None

    return {
        "retention_snapshot": retention_snapshot,
        "next_sprint_id": next_sprint.id if next_sprint else None,
        "is_session_done": next_sprint is None,
    }


async def log_drift(
    db,
    session_id: str,
    sprint_id: str,
    signal_type: str,
) -> str:
    """
    Record a DriftEvent and return a re-anchor question string.
    """
    from app.services.bedrock import BedrockService

    event = DriftEvent(
        id=str(uuid.uuid4()),
        session_id=session_id,
        sprint_id=sprint_id,
        signal_type=signal_type,
        detected_at=datetime.utcnow(),
        resolved=False,
    )
    db.add(event)
    await db.flush()

    result = await db.execute(select(Sprint).where(Sprint.id == sprint_id))
    sprint = result.scalar_one_or_none()
    content = ""
    if sprint:
        chunk = sprint.get_content_chunk()
        content = chunk.get("text", "") if isinstance(chunk, dict) else ""

    bedrock = BedrockService()
    reanchor = await bedrock.generate_reanchor_question(content)

    if isinstance(reanchor, dict):
        question_text = reanchor.get("question", "What was the last concept you remember from the material?")
        options: list[str] = reanchor.get("options", [])
        if options:
            # Format as multi-line MCQ so DriftOverlay can parse it
            return question_text + "\n" + "\n".join(options)
        return question_text
    return str(reanchor)


async def close_session(db, session_id: str) -> dict:
    """
    Mark session completed, compute aggregate stats, trigger profile update.

    Returns:
        {total_time_minutes, avg_score, topics_covered, final_snapshot, sessions_streak}
    """
    from app.models.quiz import Quiz
    from app.services.bedrock import BedrockService
    from app.services.profile_service import update_profile_after_session

    sess_result = await db.execute(
        select(StudySession).where(StudySession.id == session_id)
    )
    session = sess_result.scalar_one_or_none()
    if not session:
        raise ValueError(f"Session {session_id} not found")

    session.status = "completed"
    session.ended_at = datetime.utcnow()
    await db.flush()

    # Total session time
    total_time = 0
    if session.started_at and session.ended_at:
        total_time = int((session.ended_at - session.started_at).total_seconds() / 60)

    # Average quiz score
    quiz_result = await db.execute(
        select(Quiz).where(Quiz.session_id == session_id)
    )
    quizzes = quiz_result.scalars().all()
    scores = [q.score for q in quizzes if q.score is not None]
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0.0

    # Topics covered (first 4 words of each question, deduplicated)
    topics_covered: list[str] = []
    for quiz in quizzes:
        for q in quiz.get_questions():
            if isinstance(q, dict):
                words = q.get("question", "").split()[:4]
                topic = " ".join(words)
                if topic and topic not in topics_covered:
                    topics_covered.append(topic)
    topics_covered = topics_covered[:10]

    # Final retention snapshot
    bedrock = BedrockService()
    final_snapshot = await bedrock.generate_retention_snapshot(
        [
            {
                "avg_score": avg_score,
                "total_quizzes": len(quizzes),
                "total_time_minutes": total_time,
            }
        ]
    )

    # Update learning profile
    await update_profile_after_session(db, session.student_id, session_id)
    await db.commit()

    # Streak — count days with at least one completed sprint
    streak_result = await db.execute(
        select(Sprint)
        .where(
            Sprint.session_id == session_id,
            Sprint.status == "completed",
            Sprint.ended_at.isnot(None),
        )
        .order_by(Sprint.ended_at.desc())
        .limit(60)
    )
    # For a full session-close we use all completed sprints for this student
    all_sprints_result = await db.execute(
        select(Sprint)
        .join(StudySession, Sprint.session_id == StudySession.id)
        .where(
            StudySession.student_id == session.student_id,
            Sprint.status == "completed",
            Sprint.ended_at.isnot(None),
        )
        .order_by(Sprint.ended_at.desc())
        .limit(60)
    )
    all_sprints = all_sprints_result.scalars().all()
    sessions_streak = _calculate_streak_from_sprints(all_sprints)

    return {
        "total_time_minutes": total_time,
        "avg_score": avg_score,
        "topics_covered": topics_covered,
        "final_snapshot": final_snapshot,
        "sessions_streak": sessions_streak,
    }


def _calculate_streak(sessions: list) -> int:
    """Count consecutive calendar days that have at least one completed session."""
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


def _calculate_streak_from_sprints(sprints: list) -> int:
    """Count consecutive calendar days with at least one completed sprint."""
    if not sprints:
        return 0
    day_set = {s.ended_at.date() for s in sprints if s.ended_at}
    streak = 0
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
