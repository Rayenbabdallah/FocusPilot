from __future__ import annotations

import os
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import logging

from app.config import get_settings
from app.database import get_db
from app.models.material import Material
from app.models.student import Student
from app.services.ingestion import (
    process_pdf, save_uploaded_file, process_and_store_material, MAX_FILE_BYTES,
)

router = APIRouter(prefix="/api/materials", tags=["materials"])
logger = logging.getLogger(__name__)


async def _ensure_student_exists(db: AsyncSession, student_id: str) -> None:
    result = await db.execute(select(Student).where(Student.id == student_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Student not found")


async def _get_owned_material(
    db: AsyncSession,
    material_id: str,
    student_id: str,
) -> Material:
    result = await db.execute(
        select(Material).where(
            Material.id == material_id,
            Material.student_id == student_id,
        )
    )
    material = result.scalar_one_or_none()
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    return material


async def _read_upload_bytes_limited(file: UploadFile, max_bytes: int) -> bytes:
    parts: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum allowed size is {max_bytes // (1024 * 1024)} MB.",
            )
        parts.append(chunk)
    return b"".join(parts)


@router.post("/upload")
async def upload_material(
    student_id: str = Form(...),
    title: str = Form(...),
    file: UploadFile = File(...),
    subject: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Upload a study material, extract text, reformat for ADHD, and persist.

    Returns: {material_id, title, type, chunk_count, preview}
    """
    settings = get_settings()

    await _ensure_student_exists(db, student_id)

    file_bytes = await _read_upload_bytes_limited(file, MAX_FILE_BYTES)
    filename = file.filename or "upload"
    ext = os.path.splitext(filename)[1].lower()

    # Infer material type from extension
    type_map = {".pdf": "pdf", ".txt": "text", ".md": "text", ".pptx": "slides", ".ppt": "slides"}
    material_type = type_map.get(ext, "text")

    # Save file to disk
    unique_name = f"{uuid.uuid4()}{ext}"
    upload_path = os.path.join(settings.upload_dir, student_id)
    file_path = await save_uploaded_file(file_bytes, unique_name, upload_path)

    # Extract raw text (and page images for PDFs)
    page_images: list = []
    if material_type == "pdf":
        raw_text, page_images = await process_pdf(file_bytes)
    else:
        try:
            raw_text = file_bytes.decode("utf-8", errors="replace")
        except Exception:
            raw_text = ""

    if not raw_text.strip():
        raw_text = f"[Content from {title}]"

    # Process, reformat for ADHD, and store
    try:
        material = await process_and_store_material(
            db=db,
            student_id=student_id,
            title=title,
            material_type=material_type,
            raw_text=raw_text,
            page_images=page_images,
        )
    except Exception as e:
        await db.rollback()
        logger.exception("Material processing failed for student_id=%s", student_id)
        raise HTTPException(status_code=500, detail="Failed to process and store material")
    material.file_path = file_path
    if subject and subject.strip():
        material.subject = subject.strip()
    await db.commit()
    await db.refresh(material)

    chunks = material.get_chunks()
    preview = ""
    if chunks and isinstance(chunks[0], dict):
        preview = chunks[0].get("text", "")[:300]

    return {
        "material_id": material.id,
        "title": material.title,
        "type": material.type,
        "chunk_count": len(chunks),
        "preview": preview,
    }


@router.get("/{student_id}")
async def list_materials(
    student_id: str,
    db: AsyncSession = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Return [{id, title, type, chunk_count, created_at}] for a student."""
    await _ensure_student_exists(db, student_id)
    result = await db.execute(
        select(Material)
        .where(Material.student_id == student_id)
        .order_by(Material.created_at.desc())
    )
    materials = result.scalars().all()
    return [
        {
            "id": m.id,
            "title": m.title,
            "type": m.type,
            "subject": m.subject,
            "chunk_count": len(m.get_chunks()),
            "created_at": m.created_at.isoformat(),
        }
        for m in materials
    ]


@router.get("/{material_id}/chunks")
async def get_material_chunks(
    material_id: str,
    student_id: str,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Return {material_id, title, chunks: [...]}."""
    material = await _get_owned_material(db, material_id, student_id)
    return {
        "material_id": material.id,
        "title": material.title,
        "chunks": material.get_chunks(),
    }


@router.get("/{material_id}/cheatsheet")
async def get_cheatsheet(
    material_id: str,
    student_id: str,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Return the cheatsheet for a material.
    If not yet generated, generates and caches it on the fly.

    Returns: {material_id, title, cheatsheet}
    """
    material = await _get_owned_material(db, material_id, student_id)

    if not material.cheatsheet:
        # Generate on demand and cache
        try:
            from app.services.bedrock import BedrockService
            bedrock = BedrockService()
            full_text = material.raw_text or ""
            # Also include processed chunk text for richer cheatsheet
            chunks = material.get_chunks()
            if chunks:
                chunk_texts = " ".join(c.get("original_text", c.get("text", "")) for c in chunks[:6])
                full_text = full_text or chunk_texts
            material.cheatsheet = await bedrock.generate_cheatsheet(material.title, full_text)
            await db.commit()
        except Exception as e:
            logger.exception("Cheatsheet generation failed for material_id=%s", material_id)
            raise HTTPException(status_code=500, detail="Failed to generate cheatsheet")

    return {
        "material_id": material.id,
        "title": material.title,
        "cheatsheet": material.cheatsheet,
    }


class SubjectUpdate(BaseModel):
    subject: str


@router.patch("/{material_id}/subject")
async def update_material_subject(
    material_id: str,
    student_id: str,
    body: SubjectUpdate,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Update the subject tag for a material."""
    material = await _get_owned_material(db, material_id, student_id)
    material.subject = body.subject.strip() or None
    await db.commit()
    return {"material_id": material_id, "subject": material.subject}


@router.delete("/{material_id}")
async def delete_material(
    material_id: str,
    student_id: str,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, bool]:
    """Delete material record and file from disk."""
    material = await _get_owned_material(db, material_id, student_id)

    if material.file_path and os.path.exists(material.file_path):
        try:
            os.remove(material.file_path)
        except OSError:
            pass

    await db.delete(material)
    await db.commit()
    return {"deleted": True}
