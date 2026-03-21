from __future__ import annotations

import uuid
import json
from datetime import datetime
from typing import Optional, List, Any

from sqlalchemy import String, DateTime, Text, ForeignKey, Float, Integer
from sqlalchemy.orm import Mapped, mapped_column
from pydantic import BaseModel

from app.database import Base


class LearningProfile(Base):
    __tablename__ = "learning_profiles"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id: Mapped[str] = mapped_column(String, ForeignKey("students.id"), unique=True, nullable=False)
    avg_focus_duration_minutes: Mapped[float] = mapped_column(Float, default=25.0, nullable=False)
    best_focus_time_of_day: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    preferred_content_format: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    weak_topics: Mapped[str] = mapped_column(Text, default="[]", nullable=False)  # JSON string
    total_sessions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_study_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def get_weak_topics(self) -> list:
        if self.weak_topics:
            try:
                return json.loads(self.weak_topics)
            except Exception:
                return []
        return []

    def set_weak_topics(self, topics: list) -> None:
        self.weak_topics = json.dumps(topics)


# Pydantic schemas
class LearningProfileRead(BaseModel):
    id: str
    student_id: str
    avg_focus_duration_minutes: float
    best_focus_time_of_day: Optional[str] = None
    preferred_content_format: Optional[str] = None
    weak_topics: Optional[List[Any]] = None
    total_sessions: int
    total_study_minutes: int
    updated_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_parsed(cls, profile: LearningProfile) -> "LearningProfileRead":
        return cls(
            id=profile.id,
            student_id=profile.student_id,
            avg_focus_duration_minutes=profile.avg_focus_duration_minutes,
            best_focus_time_of_day=profile.best_focus_time_of_day,
            preferred_content_format=profile.preferred_content_format,
            weak_topics=profile.get_weak_topics(),
            total_sessions=profile.total_sessions,
            total_study_minutes=profile.total_study_minutes,
            updated_at=profile.updated_at,
        )


class LearningProfileUpdate(BaseModel):
    avg_focus_duration_minutes: Optional[float] = None
    best_focus_time_of_day: Optional[str] = None
    preferred_content_format: Optional[str] = None
    weak_topics: Optional[List[str]] = None
