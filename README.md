# FocusPilot — ADHD Study Companion

> **"AI-powered study sessions built for the ADHD brain."**

[![Competition](https://img.shields.io/badge/Competition-CODE2CURE%202026-blue)](https://ieee-sight.org)
[![IEEE SIGHT](https://img.shields.io/badge/IEEE-SIGHT%20DAY%20CONGRESS%204.0-blue)](https://ieee-sight.org)
[![SDGs](https://img.shields.io/badge/SDGs-3%20%7C%204%20%7C%2010-orange)](https://sdgs.un.org)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

**Competition:** CODE2CURE Technical Challenge 2026 · IEEE SIGHT DAY CONGRESS 4.0
**Team:** Zouza
**Domain:** Cognitive & Neurodiversity Support · SDG 3 · SDG 4 · SDG 10

---

## Table of Contents

1. [The Problem](#1-the-problem)
2. [Feature Overview](#2-feature-overview)
3. [System Architecture](#3-system-architecture)
4. [Tech Stack](#4-tech-stack)
5. [Getting Started](#5-getting-started)
6. [Project Structure](#6-project-structure)
7. [ADHD Design System](#7-adhd-design-system)
8. [API Reference](#8-api-reference)
9. [Competition Context](#9-competition-context)
10. [License](#10-license)

---

## 1. The Problem

ADHD affects approximately **366 million adults** worldwide and is one of the most prevalent neurodevelopmental conditions among students. Yet virtually every study tool on the market is designed for the neurotypical brain — assuming self-regulation, sustained attention, and consistent working memory that ADHD students simply do not have by default.

**ADHD students fail not from lack of intelligence, but from missing executive function.**

Standard tools expect students to self-impose structure, manage time, initiate tasks, and maintain focus — all domains where ADHD creates measurable functional impairment. FocusPilot is purpose-built to fill those gaps.

### ADHD Failure Modes and FocusPilot's Response

| ADHD Failure Mode | How FocusPilot Responds |
|---|---|
| **Task initiation paralysis** | Quick-start card with one-tap resume, zero decisions required; 10-minute micro-sessions remove the intimidation barrier |
| **Working memory overload** | Sprint chunking breaks material into manageable pieces; key terms strip surfaces bold vocabulary; pre-reading prime sets a clear focus objective before each chunk |
| **Time blindness** | Thick visual progress bar with real-time fill; color-coded countdown clock; dedicated break timer with visible 5-minute countdown |
| **Passive reading loop** | Quiz checkpoints after every sprint ensure active recall; skim-time detection flags when content is being skipped too quickly |
| **Attention drift** | 3-signal drift detection system: inactivity timeout (120s of no mouse/keyboard/touch), tab visibility loss (60s hidden), scroll thrash (≥5 direction reversals in 3s — distinguishes frantic skimming from normal reading); re-anchoring overlay with AI-generated recall MCQ |
| **Forgetting between sessions** | SM-2-based spaced repetition engine schedules reviews at optimal intervals; daily browser push notifications remind at the user's chosen time |

---

## 2. Feature Overview

### Session Management

- **AI session planning** — LLM analyzes uploaded material and generates a structured sprint plan with objectives, estimated duration, and difficulty curve
- **Quick-start card** — One-tap resume of the most recent session; zero decisions, zero friction
- **Micro-sessions** — Choose from 10, 15, 30, 60, 90, or 120-minute study blocks to match available energy and time
- **Energy check-in** — Full / Half / Low energy selector at session start; automatically adapts content density and sprint length
- **Pre-reading prime** — Sprint focus objective is displayed before each chunk so the brain has a target before reading begins
- **Key terms strip** — Automatically extracts bolded and emphasized terms from the current chunk and surfaces them as a vocabulary reference

### Attention & Focus

- **Drift detection (3 signals)** — Inactivity trigger at 120 seconds of no interaction; tab visibility loss trigger at 60 seconds away; scroll thrash trigger at 5 or more direction reversals (up↔down) within a 3-second window — distinguishing frantic back-and-forth from normal reading
- **Re-anchoring overlay** — When drift is detected, a focused overlay presents an MCQ or free-text recall question drawn from the current content chunk to re-engage working memory
- **Focus check-in** — Every 5 minutes, a lightweight self-assessment prompt appears: Locked in / Drifting / Lost it — logged for analytics
- **Adaptive difficulty** — After 2 consecutive quiz scores below 50%, simplified mode auto-enables: shorter sentences, more visual breaks, reduced information density
- **Frustration detection** — When a quiz score falls below 40%, an empathy card replaces the standard feedback with an encouraging message and a guided breathing prompt
- **Break timer** — A 5-minute countdown with a randomly selected ADHD-friendly break activity suggestion (movement, breathing, hydration) keeps breaks structured and bounded

### Content

- **AI content reformatter** — LLM processes uploaded PDFs or pasted text and reformats the material into sprint-sized chunks with clear headings and progressive disclosure
- **Mermaid diagram support** — Diagrams embedded in AI-generated content are rendered in-app using Mermaid.js for visual concept mapping
- **Text-to-speech** — Every content chunk can be read aloud at 0.92x rate, reducing visual fatigue and supporting auditory learners
- **"I'm lost" escape hatch** — A persistent button triggers an LLM-generated simplified re-explanation of the current chunk in plain language
- **AI-generated cheatsheet** — At the end of each session, the AI produces a condensed cheatsheet of key concepts from the studied material

### AI Tutor

- **Context-aware conversation** — The chat assistant has full awareness of the current sprint chunk and the student's session history, enabling targeted help without repeating context
- **Persistence across refreshes** — Chat history survives page reloads, capped at 50 messages to prevent context bloat
- **Typing indicator** — Animated indicator signals when the AI is generating a response, reducing uncertainty

### Quizzes & Retention

- **Post-sprint MCQ** — 3 multiple-choice questions are generated after every sprint, directly tied to the content just read
- **Fast-answer detection** — Answers submitted in under 3 seconds are flagged as potential guesses and weighted accordingly in retention scoring
- **Retention snapshot** — A per-quiz score and confidence band is logged after each quiz to track comprehension over time
- **SM-2 spaced repetition engine** — Quiz performance feeds an implementation of the SM-2 algorithm that schedules each concept for review at the scientifically optimal interval
- **Daily review queue** — Items due for review are surfaced each day in a focused review session separate from primary study

### History & Analytics

- **Session history** — Complete log of all past sessions grouped by week, with filters for status (completed, abandoned, in-progress)
- **Per-session score chart** — Bar chart of quiz scores across sprints within a selected session, with color-coded performance bands
- **Retry past sessions** — Any historical session can be relaunched with "Study this topic again" to revisit material

### Profile & Gamification

- **XP progression system** — Experience points awarded for completed sprints, quizzes, and streak maintenance; 5 progression levels: Beginner → Learner → Scholar → Expert → Master
- **12 achievement badges** — Unlockable badges for milestones including streaks, perfect quiz scores, total hours studied, and consistency goals
- **Weak topics bar chart** — Ranked bar chart of topics identified as weak by the AI learning profile, surfaced on the profile page for targeted review
- **Coaching recommendation cards** — Up to 4 actionable, personalized recommendations generated from session analytics (e.g., "Your best scores come after a break — try adding one mid-session")
- **Best focus time** — Computed from the AI learning profile to surface the time of day when the user historically studies most effectively

### Accessibility & PWA

- **WCAG AA contrast** — All text/background combinations maintain a minimum 4.5:1 contrast ratio across all color modes
- **Keyboard navigation** — Fully navigable via keyboard with clearly visible focus rings on all interactive elements
- **aria-live notifications** — Toast messages and status updates use `aria-live` regions for screen reader compatibility
- **Reduced motion support** — All animations respect `prefers-reduced-motion` and degrade gracefully to instant transitions
- **PWA installable** — Includes `manifest.json` and a service worker with cache-first strategy for offline access to previously loaded sessions
- **Daily browser notifications** — Push reminders delivered at the user's configured time to prompt daily review and maintain study consistency

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Browser / PWA Layer                          │
│                                                                     │
│   ┌─────────────┐  ┌──────────────┐  ┌────────────┐  ┌─────────┐  │
│   │  Home Page  │  │ Session Page │  │History Page│  │ Profile │  │
│   │             │  │              │  │            │  │  Page   │  │
│   │ Quick-start │  │ Sprint view  │  │  Heatmap   │  │  XP &   │  │
│   │ Upload form │  │ Drift detect │  │  Filters   │  │ Badges  │  │
│   │ Energy ck-in│  │ AI Tutor chat│  │  Bar chart │  │ Coaching│  │
│   └──────┬──────┘  └──────┬───────┘  └─────┬──────┘  └────┬────┘  │
│          │                │                 │               │       │
│          └────────────────┴─────────────────┴───────────────┘       │
│                                    │                                │
│                     ┌──────────────▼──────────────┐                │
│                     │       Zustand Store          │                │
│                     │  sessionStore · profileStore │                │
│                     │  historyStore · uiStore      │                │
│                     │  (Zustand persist middleware)│                │
│                     └──────────────┬──────────────┘                │
│                                    │                                │
│                     ┌──────────────▼──────────────┐                │
│                     │        Axios HTTP Layer       │                │
│                     │   (interceptors · retries)   │                │
└─────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ HTTP / REST
                                     │
┌─────────────────────────────────────────────────────────────────────┐
│                         FastAPI Backend                             │
│                                                                     │
│   ┌─────────────┐  ┌──────────────┐  ┌────────────┐  ┌─────────┐  │
│   │  /sessions  │  │  /materials  │  │   /quiz    │  │/profile │  │
│   │   router    │  │    router    │  │   router   │  │ router  │  │
│   └──────┬──────┘  └──────┬───────┘  └─────┬──────┘  └────┬────┘  │
│          └────────────────┴─────────────────┴───────────────┘       │
│                                    │                                │
│          ┌─────────────────────────▼─────────────────────────┐     │
│          │                  Services Layer                    │     │
│          │                                                    │     │
│          │  ┌────────────┐  ┌──────────────┐  ┌───────────┐  │     │
│          │  │ ingestion  │  │session_engine│  │quiz_engine│  │     │
│          │  │  service   │  │   service    │  │  service  │  │     │
│          │  └────────────┘  └──────────────┘  └───────────┘  │     │
│          │                                                    │     │
│          │              ┌──────────────────┐                  │     │
│          │              │ profile_service   │                  │     │
│          │              └──────────────────┘                  │     │
│          └──────────────────────┬─────────────────────────────┘     │
│                                 │                                   │
│          ┌──────────────────────┴──────────────────────┐           │
│          │                                             │           │
│   ┌──────▼───────┐                         ┌──────────▼────────┐  │
│   │   SQLite DB  │                         │   AWS Bedrock     │  │
│   │  (aiosqlite) │                         │   (Claude LLM)    │  │
│   │              │                         │                   │  │
│   │  sessions    │                         │ Content chunking  │  │
│   │  materials   │                         │ Quiz generation   │  │
│   │  quiz_items  │                         │ AI Tutor chat     │  │
│   │  profiles    │                         │ Cheatsheet gen    │  │
│   └──────────────┘                         └───────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Tech Stack

### Frontend

| Category | Technology |
|---|---|
| **Framework** | React 18 + TypeScript |
| **Build Tool** | Vite 5 |
| **Styling** | Tailwind CSS 3 + custom design tokens |
| **Animations** | Framer Motion 11 |
| **State Management** | Zustand 4 (with persist middleware) |
| **Charts** | Recharts 2 |
| **Icons** | Lucide React |
| **Markdown Rendering** | react-markdown + remark-gfm |
| **Diagrams** | Mermaid.js 11 |
| **HTTP Client** | Axios |
| **Typography** | Plus Jakarta Sans · JetBrains Mono |

### Backend

| Category | Technology |
|---|---|
| **Framework** | FastAPI 0.111 |
| **Server** | Uvicorn |
| **ORM** | SQLAlchemy 2.0 (async) |
| **Database** | SQLite + aiosqlite |
| **Validation** | Pydantic 2.7 |
| **PDF Processing** | PyMuPDF + PyPDF2 |
| **AI / LLM** | AWS Bedrock (Claude) |
| **File I/O** | aiofiles |

---

## 5. Getting Started

### Prerequisites

- Node.js 18 or higher
- Python 3.11 or higher (tested up to 3.14)
- AWS Bedrock access *(optional — see Demo Mode below)*

### Demo Mode (no AWS credentials needed)

FocusPilot detects missing credentials automatically and switches to **demo mode**, where all AI features return realistic pre-built responses. You can fully test session planning, quiz generation, the AI tutor, cheatsheets, drift detection, and retention analytics without an AWS account.

```bash
cd backend
cp .env.example .env        # leave AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY blank
```

The pre-seeded database (`focuspilot.db`) already contains a demo student, two study materials, completed sessions with quiz history, and items due for spaced repetition review — so the app is fully interactive from the first launch.

### Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate          # macOS / Linux
source venv/Scripts/activate      # Windows (bash)
# venv\Scripts\activate.bat       # Windows (cmd)

pip install -r requirements.txt

# Copy env (blank credentials = demo mode; fill in real credentials for full AI)
cp .env.example .env

# Optional: re-seed demo data (database is already included in the repo)
# python seed.py

# Start the API server
uvicorn app.main:app --reload --port 8000
```

The backend API will be available at `http://localhost:8000`.
Interactive API docs are available at `http://localhost:8000/docs`.

### Frontend Setup

```bash
cd frontend
npm install
echo "VITE_API_URL=http://localhost:8000" > .env.local
npm run dev
```

Open `http://localhost:5173` in your browser.

To build for production:

```bash
npm run build
npm run preview
```

---

## 6. Project Structure

```
FocusPilot/
├── README.md
├── docs/
│   └── technical_report.tex           # IEEE-format technical report
├── frontend/
│   ├── public/
│   │   ├── manifest.json              # PWA manifest
│   │   └── sw.js                      # Cache-first service worker
│   ├── src/
│   │   ├── main.tsx                   # App entry point
│   │   ├── App.tsx                    # Root component + routing
│   │   ├── index.css                  # Tailwind base + design tokens
│   │   ├── components/
│   │   │   ├── Layout.tsx             # App shell with bottom nav
│   │   │   ├── Skeleton.tsx           # Loading skeleton
│   │   │   └── ToastContainer.tsx     # Global toast notifications
│   │   ├── pages/
│   │   │   ├── Home.tsx               # Upload, quick-start, energy check-in
│   │   │   ├── Session.tsx            # Full session UI (sprint, quiz, drift, tutor)
│   │   │   ├── History.tsx            # Past sessions list + score charts
│   │   │   └── Profile.tsx            # XP, badges, weak topics, coaching cards
│   │   ├── hooks/
│   │   │   ├── useDriftDetection.ts   # 3-signal drift logic
│   │   │   ├── useStudyReminder.ts    # Browser notification scheduler
│   │   │   └── useToast.ts            # Toast helper
│   │   ├── store/
│   │   │   └── index.ts               # Zustand store (session, profile, UI state)
│   │   ├── api/
│   │   │   ├── client.ts              # Axios instance + error interceptor
│   │   │   ├── sessions.ts
│   │   │   ├── materials.ts
│   │   │   ├── quiz.ts
│   │   │   └── profile.ts
│   │   └── types/
│   │       └── index.ts               # All shared TypeScript types
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── backend/
│   ├── main.py                        # Uvicorn entry point
│   ├── seed.py                        # Demo data seeder
│   ├── requirements.txt
│   ├── .env.example
│   ├── focuspilot.db                  # Pre-seeded SQLite database
│   └── app/
│       ├── main.py                    # FastAPI app + CORS + routers
│       ├── config.py                  # Pydantic settings (env vars)
│       ├── database.py                # Async SQLAlchemy session factory
│       ├── routers/
│       │   ├── sessions.py            # Session + sprint + drift + tutor endpoints
│       │   ├── materials.py           # Upload, list, cheatsheet endpoints
│       │   ├── quiz.py                # Quiz generate, grade, review endpoints
│       │   └── profile.py             # Profile, stats, spaced repetition endpoints
│       ├── services/
│       │   ├── bedrock.py             # AWS Bedrock client + demo mode fallbacks
│       │   ├── ingestion.py           # PDF/text parsing + ADHD reformatting
│       │   ├── session_engine.py      # Sprint orchestration + streak logic
│       │   ├── quiz_engine.py         # MCQ generation + SM-2 scoring
│       │   └── profile_service.py     # Learning profile + stats aggregation
│       ├── models/
│       │   ├── student.py
│       │   ├── material.py
│       │   ├── session.py             # StudySession, Sprint, DriftEvent
│       │   ├── quiz.py                # Quiz, SpacedRepetitionItem
│       │   └── profile.py             # LearningProfile
│       └── utils/
│           └── text_processing.py     # Text cleaning utilities
│
└── ui-refrence/                       # Design reference assets
```

---

## 7. ADHD Design System

FocusPilot uses a purpose-built design system tuned for the perceptual and attentional profile of ADHD users: high contrast without harshness, distinct semantic colors, and motion that signals — not distracts.

### Color Tokens

| Token | Hex | Usage |
|---|---|---|
| `--color-mint` | `#98E89E` | Primary actions, success states, progress fills |
| `--color-lemon` | `#E8E870` | Warnings, time pressure, energy indicators |
| `--color-periwinkle` | `#7080E8` | Focus states, AI tutor, interactive highlights |
| `--color-lavender` | `#E898E8` | Gamification, badges, achievement celebrations |
| `--color-base` | `#050705` | Primary text and surface background |

### Typography

| Role | Font | Notes |
|---|---|---|
| **Body / UI** | Plus Jakarta Sans | 16px minimum; generous line-height (1.7) |
| **Timers / Badges / Code** | JetBrains Mono | Tabular figures for stable countdown display |

### Core Principles

| Principle | Implementation |
|---|---|
| **Minimum body text** | 16px — never smaller for reading content |
| **Max reading column** | 640px — prevents line lengths that cause saccade fatigue |
| **Progress bar height** | `h-2` (8px) — thick enough to read at a glance without consuming space |
| **Touch targets** | 44×44px minimum on all interactive elements |
| **Motion** | All transitions respect `prefers-reduced-motion`; drift overlay uses a gentle pulse, not a flash |
| **Focus rings** | 2px offset ring on all keyboard-focusable elements, using `--color-periwinkle` |
| **Contrast** | WCAG AA minimum 4.5:1 for all text/background pairs |

---

## 8. API Reference

### Sessions

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/sessions` | List all sessions for the current user, paginated |
| `POST` | `/sessions` | Create a new session with material ID and duration |
| `GET` | `/sessions/{id}` | Retrieve a single session with full sprint plan |
| `PATCH` | `/sessions/{id}` | Update session state (progress, focus events, status) |
| `DELETE` | `/sessions/{id}` | Remove a session record |
| `POST` | `/sessions/{id}/resume` | Generate a resume card for a previous session |
| `GET` | `/sessions/{id}/cheatsheet` | Fetch or generate the AI cheatsheet for a session |
| `POST` | `/sessions/{id}/chat` | Send a message to the in-session AI tutor |
| `GET` | `/sessions/{id}/chat` | Retrieve persisted chat history (last 50 messages) |

### Materials

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/materials/upload` | Upload a PDF file; triggers async ingestion and chunking |
| `POST` | `/materials/text` | Submit raw text for chunking and sprint planning |
| `GET` | `/materials` | List all uploaded materials |
| `GET` | `/materials/{id}` | Retrieve material metadata and chunk index |
| `DELETE` | `/materials/{id}` | Remove a material and its associated chunks |

### Quiz & Review

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/quiz/generate/{session_id}/{sprint_index}` | Generate 3 MCQs for a given sprint |
| `POST` | `/quiz/submit` | Submit quiz answers; returns score + SM-2 updates |
| `GET` | `/quiz/review/queue` | Get today's spaced repetition review queue |
| `POST` | `/quiz/review/submit` | Submit review answers and update SM-2 intervals |
| `GET` | `/quiz/history/{session_id}` | Retrieve all quiz attempts for a session |

### Profile

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/profile` | Retrieve user profile: XP, level, badges, settings |
| `PATCH` | `/profile` | Update profile settings (notification time, energy default) |
| `GET` | `/profile/analytics` | Aggregated analytics: focus trend, weak topics, session history |
| `GET` | `/profile/coaching` | Fetch up to 4 AI-generated coaching recommendation cards |
| `GET` | `/profile/best-window` | Compute and return the user's best historical study window |

---

## 9. Competition Context

FocusPilot was developed as a submission for the **CODE2CURE Technical Challenge 2026**, hosted at **IEEE SIGHT DAY CONGRESS 4.0** by Team ESPRIT.

### Alignment with UN Sustainable Development Goals

| SDG | Connection |
|---|---|
| **SDG 3 — Good Health & Well-Being** | Reduces academic-related stress and anxiety in neurodiverse students by providing adaptive, low-friction study support |
| **SDG 4 — Quality Education** | Enables equitable access to effective study methods for students with ADHD, who are statistically underserved by standard educational tools |
| **SDG 10 — Reduced Inequalities** | Closes the functional gap between neurodiverse and neurotypical students, supporting inclusion without requiring institutional accommodation |

### Impact Framing

ADHD is estimated to affect **5–8% of the global student population**. Without appropriate support, ADHD students are significantly more likely to drop courses, delay graduation, or exit higher education entirely. FocusPilot does not require a clinical diagnosis, a prescription, or institutional accommodation to use — it is available to any student with a browser and an internet connection, making it a zero-barrier, high-impact intervention.

---

## 10. License

MIT License

Copyright © 2026 FocusPilot Team — ESPRIT

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

<div align="center">
  Built with focus, for focus — by Team ESPRIT<br>
  CODE2CURE 2026 · IEEE SIGHT DAY CONGRESS 4.0
</div>
