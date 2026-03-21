from __future__ import annotations

# Import all models so SQLAlchemy can discover them for create_all_tables
from app.models.student import Student  # noqa: F401
from app.models.material import Material  # noqa: F401
from app.models.session import StudySession, Sprint, DriftEvent  # noqa: F401
from app.models.quiz import Quiz, SpacedRepetitionItem  # noqa: F401
from app.models.profile import LearningProfile  # noqa: F401
