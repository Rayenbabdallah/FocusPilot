#!/usr/bin/env python3
"""
FocusPilot demo data seeder.

Run:  python seed.py
      (from the backend/ directory with .env present)
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import uuid
from datetime import datetime, timedelta

# ── Path & env setup ────────────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.database import Base

# Import models so SQLAlchemy metadata is populated
from app.models.material import Material
from app.models.profile import LearningProfile
from app.models.quiz import Quiz, SpacedRepetitionItem
from app.models.session import DriftEvent, Sprint, StudySession
from app.models.student import Student

# ── Demo content ─────────────────────────────────────────────────────────────

THERMO_TEXT = """\
Introduction to Thermodynamics — Lecture Notes

Thermodynamics is the branch of physics that deals with heat, work, and temperature, and their
relation to energy, entropy, and the physical properties of matter and radiation.

The First Law of Thermodynamics states that energy cannot be created or destroyed, only converted
from one form to another. Mathematically expressed as ΔU = Q − W, where ΔU is the change in
internal energy of the system, Q is the heat added to the system, and W is the work done by the
system on its surroundings. This is a fundamental statement of energy conservation.

Internal energy (U) represents the total kinetic and potential energy of all particles within a
thermodynamic system. When a system absorbs heat Q, its internal energy increases. When it
performs work W on its surroundings, its internal energy decreases. The heat engine is a
practical application: it converts thermal energy into mechanical work through cyclic processes.

The Second Law of Thermodynamics introduces entropy and defines the direction of natural
processes. It states that the total entropy of an isolated system can never decrease over time.
Spontaneous processes always occur in the direction of increasing total entropy. This explains
why heat flows from hot to cold bodies and never spontaneously in the reverse direction.

Entropy (S) quantifies the disorder or randomness of a system. For a reversible process, the
entropy change is ΔS = Q_rev / T, where T is the absolute temperature in Kelvin. For irreversible
processes, ΔS > Q / T. The universe continuously moves toward states of maximum entropy — this
thermodynamic principle defines the arrow of time.

Heat transfer occurs through three distinct mechanisms. Conduction transfers heat through direct
molecular contact and is governed by Fourier's law: Q/t = kA(ΔT/Δx). Convection transfers heat
via bulk fluid motion and follows Newton's law of cooling. Radiation transfers energy through
electromagnetic waves without requiring a medium, governed by the Stefan-Boltzmann law.

The Carnot cycle represents the theoretical maximum efficiency of any heat engine operating
between two temperature reservoirs. Carnot efficiency η = 1 − T_cold / T_hot, where temperatures
are in Kelvin. No real engine can exceed this efficiency limit.

Thermodynamic processes are categorised by which state variable remains constant: isothermal
(constant temperature, ΔT = 0), adiabatic (no heat exchange, Q = 0), isobaric (constant
pressure, ΔP = 0), and isochoric (constant volume, ΔV = 0). Each process follows distinct
relationships among state variables P, V, and T.

Applications of thermodynamics span power generation, refrigeration, combustion engines, and
atmospheric modelling. Understanding the limits imposed by the laws of thermodynamics is
essential for designing efficient, sustainable energy systems.
"""

ADHD_TEXT = """\
ADHD and Executive Function: Implications for Studying

Attention Deficit Hyperactivity Disorder (ADHD) is a neurodevelopmental condition affecting
approximately 5–10% of students worldwide. While commonly associated with inattention and
hyperactivity, ADHD's most significant academic impact derives from its effects on executive
function — the cognitive control system governing goal-directed behaviour.

Executive function encompasses three core domains: working memory (holding and manipulating
information in mind), cognitive flexibility (shifting between tasks and strategies), and
inhibitory control (suppressing irrelevant stimuli and impulses). In students with ADHD, these
systems operate with reduced efficiency, creating specific and predictable study challenges.

Working memory impairment is among the most academically consequential ADHD symptoms. A student
may read an entire paragraph and arrive at the end retaining nothing — not from lack of effort,
but because the working memory buffer was overwhelmed before information could be consolidated
into long-term memory. This produces the passive reading loop: eyes moving, comprehension absent.

Task initiation difficulty arises from reduced prefrontal cortex activation during planning and
startup phases. The neurological reality is that an ADHD brain requires external activation
scaffolding to begin tasks. Staring at an open textbook for forty-five minutes while fully
intending to study is not laziness — it is a neurobiological startup failure.

Time blindness describes the impaired subjective sense of time experienced by people with ADHD.
Hours disappear during hyperfocus on engaging material, while required readings feel interminable.
This asymmetry makes exam preparation particularly hazardous: without external time structure,
study sessions can collapse entirely.

Emotional dysregulation compounds academic difficulties. A poor quiz score activates shame and
frustration that can shut down cognitive function for hours. Traditional grading feedback
reinforces this shame cycle. Reframing performance data as information — not judgment —
represents a critical intervention in ADHD-aware educational design.

Effective accommodation requires externalising the missing executive function: automated session
planning, built-in time structure, non-judgmental performance framing, and adaptive content
delivery that matches the brain's actual processing capacity.
"""

# ── Quiz fixtures ─────────────────────────────────────────────────────────────

SPRINT_1_QUESTIONS = [
    {
        "question": "What does the First Law of Thermodynamics state?",
        "options": [
            "A) Energy cannot be created or destroyed, only converted",
            "B) Entropy of an isolated system always increases",
            "C) Heat spontaneously flows from cold to hot",
            "D) Work equals force multiplied by distance",
        ],
        "correct_answer": "A",
        "explanation": "The First Law is a statement of energy conservation: ΔU = Q − W.",
    },
    {
        "question": "In the equation ΔU = Q − W, what does W represent?",
        "options": [
            "A) The weight of the system",
            "B) The work done by the system on its surroundings",
            "C) The wavelength of emitted radiation",
            "D) The water content of the working fluid",
        ],
        "correct_answer": "B",
        "explanation": "W is the work done BY the system. When the system expands, it does positive work.",
    },
    {
        "question": "Which unit is used for absolute thermodynamic temperature?",
        "options": ["A) Celsius", "B) Fahrenheit", "C) Kelvin", "D) Rankine"],
        "correct_answer": "C",
        "explanation": "Kelvin is the SI unit of absolute temperature. 0 K is absolute zero.",
    },
]

SPRINT_2_QUESTIONS = [
    {
        "question": "What does entropy measure in a thermodynamic system?",
        "options": [
            "A) The temperature of the system",
            "B) The pressure exerted by the system",
            "C) The degree of disorder or randomness",
            "D) The heat capacity at constant volume",
        ],
        "correct_answer": "C",
        "explanation": "Entropy S quantifies disorder. Higher entropy = more disordered states available.",
    },
    {
        "question": "What is the Carnot efficiency formula for a heat engine?",
        "options": [
            "A) η = 1 − T_cold / T_hot",
            "B) η = T_hot / T_cold",
            "C) η = W / Q_hot",
            "D) η = Q_cold / T_cold",
        ],
        "correct_answer": "A",
        "explanation": "Carnot efficiency η = 1 − T_cold/T_hot. Both temperatures must be in Kelvin.",
    },
    {
        "question": "Which heat transfer mechanism does NOT require a material medium?",
        "options": ["A) Conduction", "B) Convection", "C) Radiation", "D) Advection"],
        "correct_answer": "C",
        "explanation": "Radiation transfers energy via electromagnetic waves and travels through a vacuum.",
    },
]
# Sprint 2: student answers A, A, A → correct: C/A/C → score = 1/3... wait
# Spec says sprint 2 score = 67 = 2/3. Let's give correct answers for Q1(C), Q2(A), Q3 wrong (A)
SPRINT_2_ANSWERS = ["C", "A", "A"]  # Q1 correct, Q2 correct, Q3 wrong (correct=C, answered A)

SPRINT_3_QUESTIONS = [
    {
        "question": "What defines an isothermal thermodynamic process?",
        "options": [
            "A) Temperature remains constant throughout",
            "B) Pressure remains constant throughout",
            "C) Volume remains constant throughout",
            "D) No heat is exchanged with surroundings",
        ],
        "correct_answer": "A",
        "explanation": "Isothermal means constant temperature (iso = same, thermal = temperature).",
    },
    {
        "question": "In an adiabatic process, which quantity is zero?",
        "options": [
            "A) Work done by the system",
            "B) Change in internal energy",
            "C) Heat exchanged with surroundings",
            "D) Change in entropy",
        ],
        "correct_answer": "C",
        "explanation": "Adiabatic: Q = 0. No heat exchange occurs. ΔU = −W in this case.",
    },
    {
        "question": "What happens to entropy during an irreversible process in an isolated system?",
        "options": [
            "A) It remains constant",
            "B) It decreases",
            "C) It increases",
            "D) It oscillates",
        ],
        "correct_answer": "C",
        "explanation": "The Second Law: entropy of an isolated system always increases in irreversible processes.",
    },
]
# Sprint 3: score = 33 = 1/3.  Q1 wrong (B), Q2 correct (C), Q3 wrong (A)
SPRINT_3_ANSWERS = ["B", "C", "A"]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _basic_chunks(text: str, chunk_size: int = 300) -> list[dict]:
    """Simple word-based chunker as Bedrock fallback."""
    words = text.split()
    chunks = []
    i, idx = 0, 0
    while i < len(words):
        end = min(i + chunk_size, len(words))
        chunk_text = " ".join(words[i:end])
        chunks.append({"index": idx, "text": chunk_text, "original_text": chunk_text, "word_count": end - i})
        idx += 1
        if end >= len(words):
            break
        i = end - 50  # small overlap
    return chunks


async def _create_material(
    db: AsyncSession,
    student_id: str,
    title: str,
    material_type: str,
    raw_text: str,
) -> Material:
    """Create a material, trying Bedrock ADHD reformatting with fallback to basic chunking."""
    try:
        from app.services.ingestion import process_and_store_material
        material = await process_and_store_material(
            db=db,
            student_id=student_id,
            title=title,
            material_type=material_type,
            raw_text=raw_text,
        )
        print(f"  ✓ '{title}' — AI-reformatted, {len(material.get_chunks())} chunks")
        return material
    except Exception as e:
        print(f"  ⚠ Bedrock unavailable ({e.__class__.__name__}). Using basic chunking for '{title}'.")
        chunks = _basic_chunks(raw_text)
        material = Material(
            id=str(uuid.uuid4()),
            student_id=student_id,
            title=title,
            type=material_type,
            raw_text=raw_text,
        )
        material.set_chunks(chunks)
        db.add(material)
        await db.flush()
        print(f"  ✓ '{title}' — basic chunking, {len(chunks)} chunks")
        return material


# ── Main seed function ────────────────────────────────────────────────────────

async def seed() -> None:
    settings = get_settings()
    engine = create_async_engine(settings.database_url, echo=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        print("✓ Database tables created / verified")

    AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with AsyncSessionLocal() as db:

        # ── Guard: skip if already seeded ────────────────────────────────────
        existing = await db.execute(
            select(Student).where(Student.email == "demo@focuspilot.ai")
        )
        if existing.scalar_one_or_none():
            print("✓ Demo data already exists. Run with --force to overwrite.")
            await engine.dispose()
            return

        now = datetime.utcnow()

        # ── Student ──────────────────────────────────────────────────────────
        print("\n── Creating student ──────────────────────────────────────────")
        student = Student(
            id="00000000-0000-0000-0000-000000000001",
            name="Demo Student",
            email="demo@focuspilot.ai",
            created_at=now,
        )
        db.add(student)
        await db.flush()
        print(f"  ✓ Student: {student.name} ({student.id})")

        # ── Materials ────────────────────────────────────────────────────────
        print("\n── Creating materials (calling Bedrock if available) ─────────")
        mat1 = await _create_material(
            db=db,
            student_id=student.id,
            title="Introduction to Thermodynamics",
            material_type="text",
            raw_text=THERMO_TEXT,
        )
        mat2 = await _create_material(
            db=db,
            student_id=student.id,
            title="ADHD and Executive Function",
            material_type="text",
            raw_text=ADHD_TEXT,
        )

        # ── Completed study session ──────────────────────────────────────────
        print("\n── Creating session & sprints ────────────────────────────────")
        session_start = now - timedelta(hours=2)
        session_end = now - timedelta(hours=1)

        session = StudySession(
            id=str(uuid.uuid4()),
            student_id=student.id,
            goal="Prepare for thermodynamics midterm exam",
            status="completed",
            started_at=session_start,
            ended_at=session_end,
        )
        plan = {
            "sprints": [
                {"title": "First & Second Laws", "duration_minutes": 15,
                 "focus": "ΔU = Q − W, entropy fundamentals", "material_hint": "Thermodynamics"},
                {"title": "Heat Transfer & Carnot", "duration_minutes": 15,
                 "focus": "Conduction, convection, radiation, Carnot efficiency", "material_hint": "Thermodynamics"},
                {"title": "Thermodynamic Processes", "duration_minutes": 15,
                 "focus": "Isothermal, adiabatic, isobaric, isochoric", "material_hint": "Thermodynamics"},
            ],
            "total_sprints": 3,
        }
        session.set_planned_sprints(plan["sprints"])
        db.add(session)
        await db.flush()
        print(f"  ✓ Session: '{session.goal}'")

        # Sprints
        mat1_chunks = mat1.get_chunks()
        sprint_ids: list[str] = []
        for i, sp_plan in enumerate(plan["sprints"]):
            chunk = mat1_chunks[i] if i < len(mat1_chunks) else {"index": i, "text": sp_plan["focus"], "word_count": 10}
            sprint = Sprint(
                id=str(uuid.uuid4()),
                session_id=session.id,
                material_id=mat1.id,
                sprint_number=i,
                duration_minutes=15,
                status="completed",
                started_at=session_start + timedelta(minutes=i * 20),
                ended_at=session_start + timedelta(minutes=i * 20 + 15),
            )
            sprint.set_content_chunk({
                "index": chunk.get("index", i),
                "text": chunk.get("text", sp_plan["focus"]),
                "material_title": mat1.title,
                "title": sp_plan["title"],
                "word_count": chunk.get("word_count", 0),
            })
            db.add(sprint)
            await db.flush()
            sprint_ids.append(sprint.id)
        print(f"  ✓ 3 sprints created and completed")

        # ── Quizzes ──────────────────────────────────────────────────────────
        print("\n── Creating quizzes ──────────────────────────────────────────")

        quiz_fixtures = [
            # (sprint_idx, questions, answers, score)
            (0, SPRINT_1_QUESTIONS, ["A", "B", "C"], 100.0),
            (1, SPRINT_2_QUESTIONS, SPRINT_2_ANSWERS, 66.7),
            (2, SPRINT_3_QUESTIONS, SPRINT_3_ANSWERS, 33.3),
        ]

        quiz_ids: list[str] = []
        for sprint_idx, questions, answers, score in quiz_fixtures:
            quiz = Quiz(
                id=str(uuid.uuid4()),
                sprint_id=sprint_ids[sprint_idx],
                session_id=session.id,
                score=score,
                completed_at=session_start + timedelta(minutes=sprint_idx * 20 + 16),
            )
            quiz.set_questions(questions)
            quiz.set_answers(answers)
            db.add(quiz)
            await db.flush()
            quiz_ids.append(quiz.id)
            print(f"  ✓ Sprint {sprint_idx + 1} quiz — score {score:.0f}%")

        # ── SpacedRepetitionItems from sprint 3 wrong answers ─────────────────
        print("\n── Creating spaced repetition items ──────────────────────────")

        wrong_in_sprint3 = [
            (SPRINT_3_QUESTIONS[0], "B"),   # isothermal — student said B (isobaric)
            (SPRINT_3_QUESTIONS[2], "A"),   # entropy irreversible — student said A (constant)
        ]

        for question, student_answer in wrong_in_sprint3:
            item = SpacedRepetitionItem(
                id=str(uuid.uuid4()),
                student_id=student.id,
                source_material_id=mat1.id,
                ease_factor=2.3,   # slightly below default — already failed once
                interval_days=1,
                next_review_at=now - timedelta(minutes=5),  # due right now
                last_reviewed_at=session_end,
                times_correct=0,
                times_wrong=1,
            )
            item.set_question({
                "question": question["question"],
                "options": question["options"],
                "correct_answer": question["correct_answer"],
                "explanation": question["explanation"],
            })
            db.add(item)
            print(f"  ✓ Due item: '{question['question'][:60]}…'")

        await db.flush()

        # ── Active session (so demo opens straight into a live sprint) ──────
        print("\n── Creating active demo session ──────────────────────────────")
        active_session = StudySession(
            id="00000000-0000-0000-0000-000000000010",
            student_id=student.id,
            goal="Review thermodynamics — entropy and Carnot cycle",
            status="active",
            started_at=now - timedelta(minutes=5),
            ended_at=None,
        )
        active_plan = {
            "sprints": [
                {"title": "Entropy & Second Law", "duration_minutes": 20,
                 "focus": "Entropy, disorder, irreversible processes", "material_hint": "Thermodynamics"},
                {"title": "Carnot Cycle & Heat Engines", "duration_minutes": 20,
                 "focus": "Carnot efficiency, heat reservoirs", "material_hint": "Thermodynamics"},
            ],
            "total_sprints": 2,
            "study_tip": "Focus on the equations first, then the physical intuition.",
        }
        active_session.set_planned_sprints(active_plan["sprints"])
        db.add(active_session)
        await db.flush()

        # First sprint: pending (ready to start)
        active_sprint_1 = Sprint(
            id="00000000-0000-0000-0000-000000000011",
            session_id=active_session.id,
            material_id=mat1.id,
            sprint_number=0,
            duration_minutes=20,
            status="pending",
        )
        mat1_chunk_0 = mat1_chunks[0] if mat1_chunks else {"index": 0, "text": "Entropy fundamentals", "word_count": 10}
        active_sprint_1.set_content_chunk({
            "index": 0,
            "text": mat1_chunk_0.get("text", ""),
            "material_title": mat1.title,
            "title": "Entropy & Second Law",
            "word_count": mat1_chunk_0.get("word_count", 0),
        })
        db.add(active_sprint_1)

        # Second sprint: pending
        active_sprint_2 = Sprint(
            id="00000000-0000-0000-0000-000000000012",
            session_id=active_session.id,
            material_id=mat1.id,
            sprint_number=1,
            duration_minutes=20,
            status="pending",
        )
        mat1_chunk_1 = mat1_chunks[1] if len(mat1_chunks) > 1 else mat1_chunk_0
        active_sprint_2.set_content_chunk({
            "index": 1,
            "text": mat1_chunk_1.get("text", ""),
            "material_title": mat1.title,
            "title": "Carnot Cycle & Heat Engines",
            "word_count": mat1_chunk_1.get("word_count", 0),
        })
        db.add(active_sprint_2)
        await db.flush()
        print(f"  ✓ Active session '{active_session.goal}' with sprint ID {active_sprint_1.id}")

        # ── Drift event (for realistic session history) ───────────────────────
        drift = DriftEvent(
            id=str(uuid.uuid4()),
            session_id=session.id,
            sprint_id=sprint_ids[1],
            detected_at=session_start + timedelta(minutes=27),
            signal_type="inactivity",
            resolved=True,
            resolved_at=session_start + timedelta(minutes=28),
        )
        db.add(drift)

        # ── Learning profile ──────────────────────────────────────────────────
        print("\n── Creating learning profile ─────────────────────────────────")
        profile = LearningProfile(
            id=str(uuid.uuid4()),
            student_id=student.id,
            avg_focus_duration_minutes=18.0,
            best_focus_time_of_day="evening",
            preferred_content_format="text",
            total_sessions=1,
            total_study_minutes=60,
            updated_at=session_end,
        )
        profile.set_weak_topics(["entropy", "heat transfer", "isothermal processes"])
        db.add(profile)

        # ── Commit everything ────────────────────────────────────────────────
        await db.commit()

    await engine.dispose()
    print(f"\n{'─' * 55}")
    print(f"✓ Demo data created successfully!")
    print(f"  Student ID : 00000000-0000-0000-0000-000000000001")
    print(f"  Materials  : {mat1.title}, {mat2.title}")
    print(f"  Session    : {session.goal}")
    print(f"  Review due : 2 items")
    print(f"{'─' * 55}")
    print(f"\n  Open http://localhost:5173 to see FocusPilot in action.")


if __name__ == "__main__":
    asyncio.run(seed())
