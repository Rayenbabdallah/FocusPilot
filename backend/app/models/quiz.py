from __future__ import annotations

import uuid
import json
from datetime import datetime
from typing import Optional, List, Any

from sqlalchemy import String, DateTime, Text, ForeignKey, Boolean, Integer, Float
from sqlalchemy.orm import Mapped, mapped_column
from pydantic import BaseModel

from app.database import Base


class Quiz(Base):
    __tablename__ = "quizzes"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    sprint_id: Mapped[str] = mapped_column(String, ForeignKey("sprints.id"), nullable=False)
    session_id: Mapped[str] = mapped_column(String, ForeignKey("study_sessions.id"), nullable=False)
    questions: Mapped[str] = mapped_column(Text, nullable=False)  # JSON string
    answers: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON string
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    def get_questions(self) -> list:
        if self.questions:
            try:
                return json.loads(self.questions)
            except Exception:
                return []
        return []

    def set_questions(self, questions: list) -> None:
        self.questions = json.dumps(questions)

    def get_answers(self) -> list:
        if self.answers:
            try:
                return json.loads(self.answers)
            except Exception:
                return []
        return []

    def set_answers(self, answers: list) -> None:
        self.answers = json.dumps(answers)


class SpacedRepetitionItem(Base):
    __tablename__ = "spaced_repetition_items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id: Mapped[str] = mapped_column(String, ForeignKey("students.id"), nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)  # JSON string
    source_material_id: Mapped[Optional[str]] = mapped_column(String, ForeignKey("materials.id"), nullable=True)
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5, nullable=False)
    interval_days: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    next_review_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    last_reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    times_correct: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    times_wrong: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    def get_question(self) -> dict:
        if self.question:
            try:
                return json.loads(self.question)
            except Exception:
                return {}
        return {}

    def set_question(self, question: dict) -> None:
        self.question = json.dumps(question)


# Pydantic schemas
class QuizRead(BaseModel):
    id: str
    sprint_id: str
    session_id: str
    questions: Optional[List[Any]] = None
    answers: Optional[List[Any]] = None
    score: Optional[float] = None
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_parsed(cls, quiz: Quiz) -> "QuizRead":
        return cls(
            id=quiz.id,
            sprint_id=quiz.sprint_id,
            session_id=quiz.session_id,
            questions=quiz.get_questions(),
            answers=quiz.get_answers(),
            score=quiz.score,
            completed_at=quiz.completed_at,
        )


class QuizSubmit(BaseModel):
    answers: List[str]


class SpacedRepetitionItemRead(BaseModel):
    id: str
    student_id: str
    question: Optional[Any] = None
    source_material_id: Optional[str] = None
    ease_factor: float
    interval_days: int
    next_review_at: datetime
    last_reviewed_at: Optional[datetime] = None
    times_correct: int
    times_wrong: int

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_parsed(cls, item: SpacedRepetitionItem) -> "SpacedRepetitionItemRead":
        return cls(
            id=item.id,
            student_id=item.student_id,
            question=item.get_question(),
            source_material_id=item.source_material_id,
            ease_factor=item.ease_factor,
            interval_days=item.interval_days,
            next_review_at=item.next_review_at,
            last_reviewed_at=item.last_reviewed_at,
            times_correct=item.times_correct,
            times_wrong=item.times_wrong,
        )


class ReviewSubmit(BaseModel):
    correct: bool
