import asyncio
import sys
import types

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401  (register SQLAlchemy models)
from app.database import Base
from app.models.material import Material
from app.models.session import Sprint
from app.services import session_engine


class _FakeBedrockService:
    async def generate_session_plan(self, goal: str, materials_summary: str, available_minutes: int) -> dict:
        return {
            "total_sprints": 2,
            "sprints": [
                {"title": "Sprint 1", "duration_minutes": 10, "focus": "Focus 1"},
                {"title": "Sprint 2", "duration_minutes": 10, "focus": "Focus 2"},
            ],
        }


def test_normalize_chunk_replaces_known_generic_boilerplate() -> None:
    original = "Actual finance chapter content on payout policy."
    chunk = {
        "text": "What You'll Learn\nThis section introduces the key concepts in your study material and why they matter for real-world applications.",
        "original_text": original,
        "word_count": 20,
    }
    normalized = session_engine._normalize_chunk_for_display(chunk)
    assert normalized["text"] == original


def test_is_generic_template_text_detects_template_sentence() -> None:
    assert session_engine._is_generic_template_text(
        "This section introduces the key concepts in your study material."
    )
    assert not session_engine._is_generic_template_text(
        "Capital structure choice balances tax shield benefits against distress costs."
    )


def test_kickoff_session_uses_all_selected_materials_with_raw_text_fallback(monkeypatch) -> None:
    async def run() -> None:
        fake_module = types.ModuleType("app.services.bedrock")
        fake_module.BedrockService = _FakeBedrockService
        monkeypatch.setitem(sys.modules, "app.services.bedrock", fake_module)

        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async_session = async_sessionmaker(engine, expire_on_commit=False)

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async with async_session() as db:
            # Material 1 has no processed chunks, only raw text.
            m1 = Material(
                id="m1",
                student_id="student-1",
                title="Chapter 6 Capital Structure",
                type="pdf",
                raw_text="Capital structure theory and leverage decisions in finance.",
            )
            m1.set_chunks([])

            # Material 2 has regular processed chunks.
            m2 = Material(
                id="m2",
                student_id="student-1",
                title="Chapter 7 Dividends",
                type="pdf",
                raw_text="Dividend policy and share repurchases.",
            )
            m2.set_chunks(
                [
                    {
                        "index": 0,
                        "text": "Dividend payout policy overview.",
                        "original_text": "Dividend payout policy overview.",
                        "word_count": 4,
                    }
                ]
            )

            db.add_all([m1, m2])
            await db.flush()

            data = await session_engine.kickoff_session(
                db=db,
                student_id="student-1",
                goal="Prepare finance exam",
                material_ids=["m1", "m2"],
                available_minutes=20,
            )

            result = await db.execute(select(Sprint).order_by(Sprint.sprint_number))
            sprints = result.scalars().all()

            assert len(sprints) == 2
            assert [s.material_id for s in sprints] == ["m1", "m2"]

            first_chunk = sprints[0].get_content_chunk()
            assert "Capital structure theory" in first_chunk.get("text", "")

            used_ids = [m["id"] for m in data.get("materials_used", [])]
            assert used_ids == ["m1", "m2"]

        await engine.dispose()

    asyncio.run(run())
