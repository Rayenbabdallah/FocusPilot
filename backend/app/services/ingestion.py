from __future__ import annotations

import asyncio
import io
import logging
import os
import re
import uuid
from datetime import datetime

import aiofiles

logger = logging.getLogger(__name__)

# ─── Limits ────────────────────────────────────────────────────────────────────

MAX_AI_CHUNKS = 200       # Process all chunks with AI (effectively uncapped)
MAX_VISION_PAGES = 15     # Vision analysis for up to 15 visual pages
CHUNK_CONCURRENCY = 8     # Max simultaneous Bedrock calls for chunk reformatting
VISION_CONCURRENCY = 3    # Max simultaneous Bedrock vision calls
MAX_FILE_BYTES = 50 * 1024 * 1024  # 50 MB hard limit

# ─── PDF extraction ────────────────────────────────────────────────────────────

async def process_pdf(file_bytes: bytes) -> tuple[str, list[dict]]:
    """
    Extract text and page images from a PDF.

    Returns:
        (full_raw_text, page_images)
        page_images: list of {"page": int, "bytes": bytes, "has_visuals": bool}
    """
    try:
        import fitz  # pymupdf

        doc = fitz.open(stream=file_bytes, filetype="pdf")
        page_texts: list[str] = []
        page_images: list[dict] = []

        for page_num in range(len(doc)):
            page = doc[page_num]

            # Extract text with layout preservation
            text = page.get_text("text").strip()
            page_texts.append(text)

            # Check if page has embedded images or drawings
            image_list = page.get_images(full=False)
            drawing_list = page.get_drawings()
            has_visuals = len(image_list) > 0 or len(drawing_list) > 15

            if has_visuals:
                mat = fitz.Matrix(1.5, 1.5)
                pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
                page_images.append({
                    "page": page_num,
                    "bytes": pix.tobytes("jpeg"),
                    "has_visuals": True,
                })

        doc.close()
        raw_text = "\n\n".join(filter(None, page_texts))
        raw_text = re.sub(r"\n{3,}", "\n\n", raw_text)
        raw_text = re.sub(r"[ \t]{2,}", " ", raw_text)
        return raw_text.strip(), page_images

    except ImportError:
        logger.warning("pymupdf not available, falling back to PyPDF2")
        return await _process_pdf_fallback(file_bytes), []
    except Exception as e:
        logger.error(f"PDF extraction error: {e}")
        return await _process_pdf_fallback(file_bytes), []


async def _process_pdf_fallback(file_bytes: bytes) -> str:
    """Fallback PDF extraction using PyPDF2."""
    try:
        import PyPDF2
        reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
        parts = [page.extract_text() for page in reader.pages if page.extract_text()]
        raw = "\n\n".join(parts)
        raw = re.sub(r"\n{3,}", "\n\n", raw)
        raw = re.sub(r"[ \t]{2,}", " ", raw)
        return raw.strip()
    except Exception as e:
        logger.error(f"PyPDF2 fallback error: {e}")
        return ""


async def save_uploaded_file(
    file_bytes: bytes, filename: str, upload_dir: str
) -> str:
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, filename)
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(file_bytes)
    return file_path


async def process_and_store_material(
    db,
    student_id: str,
    title: str,
    material_type: str,
    raw_text: str,
    page_images: list[dict] | None = None,
):
    """
    Process material: enrich with vision (parallel, capped), chunk,
    AI-reformat first MAX_AI_CHUNKS in parallel, and persist.

    Cheatsheet is intentionally skipped here — it is generated on first
    request via GET /materials/{id}/cheatsheet so the upload stays fast.
    """
    from app.models.material import Material
    from app.services.bedrock import BedrockService

    bedrock = BedrockService()

    # ── Step 1: Vision enrichment (parallel, max 3 pages) ───────────────────────
    enriched_text = raw_text
    if page_images:
        enriched_text = await _enrich_with_vision(raw_text, page_images, bedrock)

    # ── Step 2: Chunk the enriched text ──────────────────────────────────────────
    raw_chunks = chunk_text(enriched_text)

    # ── Step 3: AI-reformat chunks in parallel (first MAX_AI_CHUNKS only) ────────
    processed = await process_chunks_with_ai(raw_chunks, bedrock)

    material = Material(
        id=str(uuid.uuid4()),
        student_id=student_id,
        title=title,
        type=material_type,
        raw_text=raw_text,
        cheatsheet=None,   # generated on-demand via /cheatsheet endpoint
        created_at=datetime.utcnow(),
    )
    material.set_chunks(processed)
    db.add(material)
    await db.flush()
    return material


async def _enrich_with_vision(
    raw_text: str,
    page_images: list[dict],
    bedrock,
) -> str:
    """
    Analyze pages with visuals in parallel (up to MAX_VISION_PAGES).
    Uses a semaphore to avoid hammering Bedrock.
    """
    if not page_images:
        return raw_text

    sem = asyncio.Semaphore(VISION_CONCURRENCY)

    async def analyze_one(page_info: dict) -> str | None:
        async with sem:
            try:
                description = await bedrock.analyze_page_with_vision(
                    image_bytes=page_info["bytes"],
                    page_num=page_info["page"],
                )
                if description.strip():
                    return f"--- [Page {page_info['page'] + 1} Visual Content] ---\n{description}"
            except Exception as e:
                logger.error(f"Vision analysis failed for page {page_info['page']}: {e}")
            return None

    capped = page_images[:MAX_VISION_PAGES]
    results = await asyncio.gather(*[analyze_one(p) for p in capped])
    descriptions = [r for r in results if r]

    if descriptions:
        return raw_text + "\n\n" + "\n\n".join(descriptions)
    return raw_text


# ─── Background ingestion task (kept for router compatibility) ─────────────────

async def ingest_material(material_id: str, database_url: str) -> None:
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
    from sqlalchemy import select
    from app.models.material import Material
    from app.services.bedrock import BedrockService

    engine = create_async_engine(database_url, echo=False)
    AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Material).where(Material.id == material_id))
            material = result.scalar_one_or_none()
            if not material:
                logger.error(f"Material {material_id} not found for ingestion")
                return

            raw_text = ""
            page_images: list[dict] = []
            if material.file_path:
                if material.type == "pdf":
                    file_bytes = open(material.file_path, "rb").read()
                    raw_text, page_images = await process_pdf(file_bytes)
                else:
                    raw_text = await extract_text_file(material.file_path)

            if not raw_text:
                raw_text = f"[Content from {material.title}]"

            enriched_text = raw_text
            bedrock = BedrockService()
            if page_images:
                enriched_text = await _enrich_with_vision(raw_text, page_images, bedrock)

            material.raw_text = raw_text
            chunks = chunk_text(enriched_text)
            processed = await process_chunks_with_ai(chunks, bedrock)
            material.set_chunks(processed)

            if not material.cheatsheet:
                try:
                    material.cheatsheet = await bedrock.generate_cheatsheet(
                        material.title, enriched_text
                    )
                except Exception as e:
                    logger.error(f"Background cheatsheet generation failed: {e}")

            await db.commit()
            logger.info(f"Ingestion complete for material {material_id}: {len(processed)} chunks")

    except Exception as e:
        logger.error(f"Ingestion failed for material {material_id}: {e}")
    finally:
        await engine.dispose()


# ─── Helpers ───────────────────────────────────────────────────────────────────

async def extract_pdf_text(file_path: str) -> str:
    try:
        file_bytes = open(file_path, "rb").read()
        text, _ = await process_pdf(file_bytes)
        return text
    except Exception as e:
        logger.error(f"PDF extraction error for {file_path}: {e}")
        return ""


async def extract_text_file(file_path: str) -> str:
    try:
        async with aiofiles.open(file_path, "r", encoding="utf-8", errors="replace") as f:
            return await f.read()
    except Exception as e:
        logger.error(f"Text extraction error for {file_path}: {e}")
        return ""


def chunk_text(
    text: str,
    chunk_size: int = 800,
    overlap: int = 80,
) -> list[dict]:
    """
    Split text into chunks that respect paragraph and section boundaries.

    Strategy:
    1. Split the document into paragraphs (double-newline separated).
    2. Greedily accumulate paragraphs until the word count reaches chunk_size.
    3. When a boundary is reached, emit the chunk and carry the last paragraph
       as overlap into the next chunk so concepts don't start cold.
    4. If a single paragraph is larger than chunk_size, fall back to
       word-count splitting within that paragraph.
    """
    from app.utils.text_processing import clean_text

    text = clean_text(text)
    if not text.strip():
        return []

    # Split on paragraph breaks (two or more newlines)
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]

    chunks: list[dict] = []
    index = 0
    current_words: list[str] = []
    overlap_words: list[str] = []  # carried from previous chunk

    def emit(words: list[str]) -> None:
        nonlocal index
        if not words:
            return
        chunks.append({
            "index": index,
            "text": " ".join(words),
            "word_count": len(words),
        })
        index += 1

    for para in paragraphs:
        para_words = para.split()

        # If this single paragraph is larger than chunk_size, split it inline
        if len(para_words) > chunk_size:
            # Flush whatever we have first
            if current_words:
                emit(current_words)
                overlap_words = current_words[-overlap:] if overlap else []
                current_words = list(overlap_words)

            # Word-split the oversized paragraph
            p_start = 0
            while p_start < len(para_words):
                p_end = min(p_start + chunk_size, len(para_words))
                segment = para_words[p_start:p_end]
                if p_start == 0 and current_words:
                    segment = current_words + segment
                    current_words = []
                emit(segment)
                if p_end >= len(para_words):
                    break
                p_start = p_end - overlap
            overlap_words = para_words[-overlap:] if overlap else []
            current_words = list(overlap_words)
            continue

        # Normal paragraph: accumulate
        if len(current_words) + len(para_words) > chunk_size and current_words:
            emit(current_words)
            # Carry last paragraph as overlap (natural boundary)
            last_para_words = current_words[-(len(overlap_words) or overlap):]
            current_words = last_para_words + para_words
        else:
            current_words.extend(para_words)

    # Flush final chunk
    if current_words:
        emit(current_words)

    return chunks


async def process_chunks_with_ai(
    chunks: list[dict],
    bedrock,
) -> list[dict]:
    """
    AI-reformat the first MAX_AI_CHUNKS chunks in parallel (semaphore CHUNK_CONCURRENCY).
    Remaining chunks beyond the cap are stored as raw text — they are processed
    lazily if a session sprint ever needs them.
    """
    sem = asyncio.Semaphore(CHUNK_CONCURRENCY)

    async def process_one(chunk: dict) -> dict:
        async with sem:
            try:
                reformatted = await bedrock.reformat_content(chunk["text"], format_hint="adhd")
                return {
                    "index": chunk["index"],
                    "text": reformatted,
                    "original_text": chunk["text"],
                    "word_count": chunk["word_count"],
                }
            except Exception as e:
                logger.error(f"Chunk AI processing error at index {chunk['index']}: {e}")
                return {
                    "index": chunk["index"],
                    "text": chunk["text"],
                    "original_text": chunk["text"],
                    "word_count": chunk["word_count"],
                }

    to_process = chunks[:MAX_AI_CHUNKS]
    raw_remainder = chunks[MAX_AI_CHUNKS:]

    processed: list[dict] = list(await asyncio.gather(*[process_one(c) for c in to_process]))

    # Append remaining raw chunks (no AI call — store as-is)
    for chunk in raw_remainder:
        processed.append({
            "index": chunk["index"],
            "text": chunk["text"],
            "original_text": chunk["text"],
            "word_count": chunk["word_count"],
        })

    return processed
