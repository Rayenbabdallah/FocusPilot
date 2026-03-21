from __future__ import annotations

import uuid
import json
from datetime import datetime
from typing import Optional, List, Any

from sqlalchemy import String, DateTime, Text, ForeignKey, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column
from pydantic import BaseModel

from app.database import Base


class StudySession(Base):
    __tablename__ = "study_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id: Mapped[str] = mapped_column(String, ForeignKey("students.id"), nullable=False)
    goal: Mapped[str] = mapped_column(Text, nullable=False)
    planned_sprints: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON string
    status: Mapped[str] = mapped_column(String, default="active", nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    def get_planned_sprints(self) -> list:
        if self.planned_sprints:
            try:
                return json.loads(self.planned_sprints)
            except Exception:
                return []
        return []

    def set_planned_sprints(self, sprints: list) -> None:
        self.planned_sprints = json.dumps(sprints)


class Sprint(Base):
    __tablename__ = "sprints"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String, ForeignKey("study_sessions.id"), nullable=False)
    material_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("materials.id"), nullable=True)
    sprint_number: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    content_chunk: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON string
    status: Mapped[str] = mapped_column(String, default="pending", nullable=False)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    def get_content_chunk(self) -> dict:
        if self.content_chunk:
            try:
                return json.loads(self.content_chunk)
            except Exception:
                return {}
        return {}

    def set_content_chunk(self, chunk: dict) -> None:
        self.content_chunk = json.dumps(chunk)


class DriftEvent(Base):
    __tablename__ = "drift_events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String, ForeignKey("study_sessions.id"), nullable=False)
    sprint_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("sprints.id"), nullable=True)
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    signal_type: Mapped[str] = mapped_column(String, nullable=False)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


# Pydantic schemas
class DriftEventRead(BaseModel):
    id: str
    session_id: str
    sprint_id: Optional[str] = None
    detected_at: datetime
    signal_type: str
    resolved: bool
    resolved_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class SprintRead(BaseModel):
    id: str
    session_id: str
    material_id: Optional[str] = None
    sprint_number: int
    duration_minutes: int
    content_chunk: Optional[Any] = None
    status: str
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_parsed(cls, sprint: Sprint) -> "SprintRead":
        chunk = sprint.get_content_chunk()
        return cls(
            id=sprint.id,
            session_id=sprint.session_id,
            material_id=sprint.material_id,
            sprint_number=sprint.sprint_number,
            duration_minutes=sprint.duration_minutes,
            content_chunk=chunk,
            status=sprint.status,
            started_at=sprint.started_at,
            ended_at=sprint.ended_at,
        )


class StudySessionRead(BaseModel):
    id: str
    student_id: str
    goal: str
    planned_sprints: Optional[Any] = None
    status: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    sprints: Optional[List[SprintRead]] = None
    drift_events: Optional[List[DriftEventRead]] = None

    model_config = {"from_attributes": True}


class StudySessionCreate(BaseModel):
    student_id: str
    goal: str
    material_ids: List[str]
    available_minutes: int = 90


class SprintCreate(BaseModel):
    session_id: str
    material_id: Optional[str] = None
    sprint_number: int
    duration_minutes: int = 15
    content_chunk: Optional[Any] = None


class DriftEventCreate(BaseModel):
    sprint_id: Optional[str] = None
    signal_type: str
