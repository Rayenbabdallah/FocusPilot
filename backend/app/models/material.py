from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional, List, Any

from sqlalchemy import String, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from pydantic import BaseModel, field_validator
import json

from app.database import Base


class Material(Base):
    __tablename__ = "materials"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id: Mapped[str] = mapped_column(String, ForeignKey("students.id"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)  # pdf/video/slides/text
    file_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    raw_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    processed_chunks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON string
    cheatsheet: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # markdown cheatsheet
    subject: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # user-assigned subject/topic
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    def get_chunks(self) -> list:
        if self.processed_chunks:
            try:
                return json.loads(self.processed_chunks)
            except Exception:
                return []
        return []

    def set_chunks(self, chunks: list) -> None:
        self.processed_chunks = json.dumps(chunks)


# Pydantic schemas
class MaterialCreate(BaseModel):
    student_id: str
    title: str
    type: str
    file_path: Optional[str] = None


class MaterialRead(BaseModel):
    id: str
    student_id: str
    title: str
    type: str
    file_path: Optional[str] = None
    raw_text: Optional[str] = None
    processed_chunks: Optional[List[Any]] = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_with_chunks(cls, material: Material) -> "MaterialRead":
        chunks = material.get_chunks()
        return cls(
            id=material.id,
            student_id=material.student_id,
            title=material.title,
            type=material.type,
            file_path=material.file_path,
            raw_text=material.raw_text,
            processed_chunks=chunks,
            created_at=material.created_at,
        )
