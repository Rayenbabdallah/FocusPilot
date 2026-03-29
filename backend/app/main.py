from __future__ import annotations

import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Dict

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import create_all_tables, get_db, engine
from app.models.student import Student, StudentCreate, StudentRead
from app.routers import materials, sessions, quiz, profile


import logging
logger = logging.getLogger("focuspilot")

@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_all_tables()
    await _migrate_add_columns()
    await _migrate_repair_generic_chunks()
    from app.config import get_settings
    settings = get_settings()
    os.makedirs(settings.upload_dir, exist_ok=True)

    # Test Bedrock connectivity at startup — warn but never block
    try:
        from app.services.bedrock import BedrockService
        bedrock = BedrockService()
        connected = bedrock.test_bedrock_connection()
        if connected:
            logger.info("✓ Amazon Bedrock connection verified")
        else:
            logger.warning(
                "⚠ Amazon Bedrock unreachable — AI features will return fallback responses. "
                "Check AWS credentials and model access in us-east-1."
            )
    except Exception as e:
        logger.warning(f"⚠ Bedrock startup check failed: {e}")

    yield


app = FastAPI(
    title="FocusPilot API",
    description="ADHD-focused study companion powered by Amazon Bedrock",
    version="0.1.0",
    lifespan=lifespan,
)

from app.config import get_settings as _get_settings
_cors_origins = [o.strip() for o in _get_settings().cors_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(materials.router)
app.include_router(sessions.router)
app.include_router(quiz.router)
app.include_router(profile.router)


async def _migrate_add_columns() -> None:
    """Add new columns to existing tables without dropping data (SQLite safe)."""
    from sqlalchemy import text
    async with engine.begin() as conn:
        migrations = [
            "ALTER TABLE materials ADD COLUMN cheatsheet TEXT",
            "ALTER TABLE materials ADD COLUMN subject TEXT",
        ]
        for stmt in migrations:
            try:
                await conn.execute(text(stmt))
            except Exception as e:
                # SQLite duplicate-column errors are expected on repeat startup.
                if "duplicate column name" in str(e).lower():
                    continue
                raise


async def _migrate_repair_generic_chunks() -> None:
    """
    Repair legacy generic AI template output stored in DB chunks by restoring
    each chunk's original_text when available.
    """
    from app.database import AsyncSessionLocal
    from app.models.material import Material
    from app.models.session import Sprint
    from app.services.session_engine import _is_generic_template_text

    repaired_materials = 0
    repaired_sprints = 0

    async with AsyncSessionLocal() as db:
        mats = (await db.execute(select(Material))).scalars().all()
        for mat in mats:
            chunks = mat.get_chunks()
            if not isinstance(chunks, list) or not chunks:
                continue
            touched = False
            for chunk in chunks:
                if not isinstance(chunk, dict):
                    continue
                text = str(chunk.get("text", "") or "")
                original = str(chunk.get("original_text", "") or "")
                if original and _is_generic_template_text(text):
                    chunk["text"] = original
                    chunk["word_count"] = len(original.split())
                    touched = True
            if touched:
                mat.set_chunks(chunks)
                repaired_materials += 1

        sprints = (await db.execute(select(Sprint))).scalars().all()
        for sprint in sprints:
            chunk = sprint.get_content_chunk()
            if not isinstance(chunk, dict):
                continue
            text = str(chunk.get("text", "") or "")
            original = str(chunk.get("original_text", "") or "")
            if original and _is_generic_template_text(text):
                chunk["text"] = original
                chunk["word_count"] = len(original.split())
                sprint.set_content_chunk(chunk)
                repaired_sprints += 1

        if repaired_materials or repaired_sprints:
            await db.commit()
            logger.info(
                "Repaired legacy generic chunks: materials=%s sprints=%s",
                repaired_materials,
                repaired_sprints,
            )


# ─── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health_check() -> Dict[str, Any]:
    """Ping the API and verify Bedrock connectivity."""
    from app.services.bedrock import BedrockService
    bedrock = BedrockService()
    connected = bedrock.test_bedrock_connection()
    return {
        "status": "ok",
        "bedrock_connected": connected,
        "timestamp": datetime.utcnow().isoformat(),
    }


# ─── Students ─────────────────────────────────────────────────────────────────

DEFAULT_STUDENT_ID = "00000000-0000-0000-0000-000000000001"


@app.post("/api/students", response_model=StudentRead, tags=["students"])
async def create_student(
    payload: StudentCreate,
    db: AsyncSession = Depends(get_db),
) -> StudentRead:
    """Create a new student. If email already exists, return existing record."""
    result = await db.execute(select(Student).where(Student.email == payload.email))
    existing = result.scalar_one_or_none()
    if existing:
        return StudentRead.model_validate(existing)

    student = Student(
        name=payload.name,
        email=payload.email,
        created_at=datetime.utcnow(),
    )
    db.add(student)
    await db.commit()
    await db.refresh(student)
    return StudentRead.model_validate(student)


@app.get("/api/students/{student_id}", response_model=StudentRead, tags=["students"])
async def get_student(
    student_id: str,
    db: AsyncSession = Depends(get_db),
) -> StudentRead:
    """Return a student by ID. Auto-creates the default demo student on first access."""
    if student_id == DEFAULT_STUDENT_ID:
        result = await db.execute(select(Student).where(Student.id == student_id))
        student = result.scalar_one_or_none()
        if not student:
            student = Student(
                id=student_id,
                name="Demo Student",
                email="demo@focuspilot.app",
                created_at=datetime.utcnow(),
            )
            db.add(student)
            await db.commit()
            await db.refresh(student)
        return StudentRead.model_validate(student)

    result = await db.execute(select(Student).where(Student.id == student_id))
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return StudentRead.model_validate(student)
