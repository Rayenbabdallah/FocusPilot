# FocusPilot — Architecture Diagrams

> System design reference for the FocusPilot ADHD Study Companion.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Session Lifecycle State Machine](#2-session-lifecycle-state-machine)
3. [Drift Detection Data Flow](#3-drift-detection-data-flow)
4. [Study Session Data Flow](#4-study-session-data-flow)
5. [Database Entity Relationship Diagram](#5-database-entity-relationship-diagram)
6. [Frontend Component Tree](#6-frontend-component-tree)
7. [Key Design Decisions](#key-design-decisions)

---

## 1. System Overview

Top-level C4-style component diagram showing the full FocusPilot system from client through backend services to external infrastructure.

```mermaid
flowchart LR
    subgraph Browser["Browser / PWA (Client)"]
        direction TB
        HP[Home Page]
        SP[Session Page]
        HSP[History Page]
        PP[Profile Page]
        ZS[("Zustand Store\n(persist → localStorage)")]
        SW[Service Worker\noffline cache]
    end

    subgraph REST["REST API Boundary"]
        direction TB
        APIB["HTTP / JSON"]
    end

    subgraph Backend["FastAPI Backend"]
        direction TB
        subgraph Routers["Routers"]
            MR[Materials Router]
            SR[Sessions Router]
            QR[Quiz Router]
            PR[Profile Router]
        end
        subgraph Services["Services Layer"]
            IS[Ingestion Service]
            SE[Session Engine]
            QE[Quiz Engine]
            PS[Profile Service]
        end
    end

    subgraph DataStores["Data Stores"]
        direction TB
        DB[(SQLite Database)]
        FS[File Storage\nuploads/]
    end

    subgraph External["External"]
        AB[AWS Bedrock\nLLM Inference]
    end

    HP & SP & HSP & PP <--> ZS
    ZS <--> APIB
    SW -.->|"cache"| HP & SP & HSP & PP
    APIB <--> MR & SR & QR & PR
    MR --> IS
    SR --> SE
    QR --> QE
    PR --> PS
    IS & SE & QE & PS <--> DB
    IS --> FS
    SE & QE & IS --> AB
```

---

## 2. Session Lifecycle State Machine

All states and transitions of a FocusPilot study session from initialization through completion.

```mermaid
stateDiagram-v2
    [*] --> Idle : App loads

    Idle --> PlanGenerated : POST /sessions/start\n(Bedrock plans sprints)

    PlanGenerated --> SprintActive : Navigate to /session\nPOST /sprint/{id}/start

    SprintActive --> DriftDetected : Behavioral signal\nexceeds threshold

    DriftDetected --> SprintActive : Student dismisses\nreanchor question\n(dismissDrift())

    SprintActive --> BreakTimer : Sprint duration ends\n(break scheduled)

    BreakTimer --> SprintActive : Break ends\nPOST /sprint/{id}/start\n(next sprint)

    SprintActive --> QuizPending : Student clicks Done\nPOST /quiz/generate/{sprintId}

    QuizPending --> QuizComplete : Student submits answers\nPOST /quiz/{id}/submit

    QuizComplete --> SprintActive : More sprints remaining\nPOST /sprint/{id}/complete\n→ next sprint

    QuizComplete --> SessionComplete : All sprints finished\nPOST /sprint/{id}/complete

    SessionComplete --> [*] : POST /sessions/{id}/close\nFinal stats returned
```

---

## 3. Drift Detection Data Flow

End-to-end sequence from raw behavioral signal in the browser through LLM reanchor generation and overlay rendering.

```mermaid
sequenceDiagram
    participant B as Browser
    participant H as useDriftDetection hook
    participant A as FastAPI /drift
    participant LLM as AWS Bedrock
    participant Z as Zustand Store
    participant UI as DriftOverlay UI

    B->>H: Inactivity timer fires<br/>OR tab hidden event<br/>OR scroll-thrash detected
    H->>H: Evaluate signal against threshold
    H->>Z: recordDrift(signal_type)
    H->>A: POST /drift<br/>{ signal_type, session_id, sprint_id }
    A->>LLM: Prompt: generate reanchor<br/>question from current chunk
    LLM-->>A: Reanchor question text
    A-->>H: { question, drift_event_id }
    H->>Z: setDrifting(true)<br/>setReanchor(question)
    Z-->>UI: State update triggers render
    UI->>B: DriftOverlay displayed<br/>with reanchor question

    B->>UI: Student answers or dismisses
    UI->>H: dismissDrift(drift_event_id)
    H->>A: PATCH /drift/{id}/resolve
    A-->>H: 200 OK
    H->>Z: setDrifting(false)<br/>clearReanchor()
    H->>H: Reset all behavioral timers
```

---

## 4. Study Session Data Flow

Full lifecycle sequence from goal-setting on the Home page through sprint execution, quizzing, and session close.

```mermaid
sequenceDiagram
    participant S as Student
    participant Home as Home Page
    participant API as FastAPI /sessions
    participant SE as Session Engine
    participant LLM as AWS Bedrock
    participant Page as Session Page
    participant QE as Quiz Engine

    S->>Home: Sets goal + selects materials<br/>+ clicks Start
    Home->>API: POST /sessions/start<br/>{ goal, material_ids, duration }
    API->>SE: plan_session(goal, materials)
    SE->>LLM: Prompt: generate sprint plan<br/>+ chunk first material
    LLM-->>SE: Sprint plan + chunk content
    SE-->>API: SessionPlan + first_sprint_id + first_chunk
    API-->>Home: 201 Created { session_id, plan, first_chunk }
    Home->>Home: Store in Zustand
    Home->>Page: navigate("/session")

    Page->>API: POST /sprint/{id}/start
    API-->>Page: 200 OK { chunk_content, key_terms }

    S->>Page: Reads chunk, clicks Done
    Page->>API: POST /quiz/generate/{sprintId}
    API->>QE: generate_mcq(chunk, key_terms)
    QE->>LLM: Prompt: create MCQ questions
    LLM-->>QE: Questions JSON
    QE-->>API: Quiz object
    API-->>Page: { quiz_id, questions }

    S->>Page: Answers quiz questions
    Page->>API: POST /quiz/{id}/submit<br/>{ answers }
    API->>QE: grade(answers, correct_answers)
    QE-->>API: { score, feedback, sr_items }
    API-->>Page: Quiz results

    Page->>API: POST /sprint/{id}/complete<br/>{ quiz_score }
    API->>SE: compute_retention_snapshot(sprint)
    SE-->>API: retention_score

    alt More sprints remaining
        API-->>Page: { next_sprint_id, next_chunk }
        Page->>API: POST /sprint/{next_id}/start
    else All sprints complete
        Page->>API: POST /sessions/{id}/close
        API-->>Page: { final_stats, badges_earned }
        Page->>Page: Show SessionComplete summary
    end
```

---

## 5. Database Entity Relationship Diagram

Full relational schema for the FocusPilot SQLite database.

```mermaid
erDiagram
    STUDENT {
        string id PK
        string name
        string email
        datetime created_at
    }

    MATERIAL {
        string id PK
        string student_id FK
        string title
        string type
        string subject
        int chunk_count
        datetime created_at
    }

    STUDY_SESSION {
        string id PK
        string student_id FK
        string goal
        string status
        datetime started_at
        datetime ended_at
    }

    SPRINT {
        string id PK
        string session_id FK
        int sprint_number
        int duration_minutes
        string status
        float quiz_score
    }

    QUIZ {
        string id PK
        string sprint_id FK
        json questions
        float score
        datetime completed_at
    }

    DRIFT_EVENT {
        string id PK
        string session_id FK
        string sprint_id FK
        string signal_type
        datetime detected_at
        boolean resolved
    }

    SPACED_REPETITION_ITEM {
        string id PK
        string student_id FK
        float ease_factor
        int interval_days
        datetime next_review_at
        int times_correct
        int times_wrong
    }

    LEARNING_PROFILE {
        string id PK
        string student_id FK
        float avg_focus_minutes
        string best_focus_time
        json weak_topics
        int total_sessions
        int total_study_minutes
    }

    STUDENT ||--o{ MATERIAL : "owns"
    STUDENT ||--o{ STUDY_SESSION : "conducts"
    STUDENT ||--|| LEARNING_PROFILE : "has"
    STUDY_SESSION ||--o{ SPRINT : "contains"
    SPRINT ||--o{ DRIFT_EVENT : "triggers"
    SPRINT ||--o| QUIZ : "has"
    QUIZ }o--o{ SPACED_REPETITION_ITEM : "generates"
    STUDENT ||--o{ SPACED_REPETITION_ITEM : "practices"
```

---

## 6. Frontend Component Tree

React component hierarchy from the application root through all page-level and leaf components.

```mermaid
flowchart TB
    App["App.tsx\nuseStudyReminder hook active"]
    App --> Router[BrowserRouter]
    Router --> Layout[Layout]

    Layout --> Home[Home Page]
    Layout --> Session[Session Page]
    Layout --> History[History Page]
    Layout --> Profile[Profile Page]

    Home --> QSC[QuickStartCard]
    Home --> SSF[StudentSetupForm]
    Home --> SC[SubjectCombo]
    Home --> MC["MaterialCard (× N)"]
    Home --> DZ[DropZone]
    Home --> SF[SessionForm]
    SF --> TP[TimePills]
    SF --> MCB[MaterialCheckboxes]
    SF --> RUI[ReminderUI]
    SF --> SB[StartButton]

    Session --> SH[SprintHeader]
    SH --> TM[Timer]
    SH --> PB[ProgressBar]
    Session --> CA[ContentArea]
    CA --> PO[PrimingOverlay]
    CA --> KT[KeyTermsStrip]
    CA --> MDC[MarkdownContent]
    CA --> TB[Toolbar]
    Session --> TP2[TutorPanel]
    TP2 --> ML[MessageList]
    TP2 --> IB[InputBox]
    Session --> OV[Overlays]
    OV --> ECM[EnergyCheckModal]
    OV --> QM[QuizModal]
    OV --> DO[DriftOverlay]
    OV --> BTM[BreakTimerModal]
    OV --> FC[FrustrationCard]
    OV --> FCI[FocusCheckIn]
    OV --> WBB[WelcomeBackBanner]
    OV --> CSM[CheatsheetModal]

    History --> RQB[ReviewQueueBanner]
    History --> SF2[StatusFilters]
    History --> SCd[SessionCard\nexpandable]
    SCd --> RB[RetryButton]
    SCd --> BC[BarChart]
    History --> RM[ReviewModal]

    Profile --> LC[LevelCard]
    Profile --> SG[StatsGrid]
    Profile --> SH2[StudyHeatmap]
    Profile --> CH[Charts]
    CH --> FT[FocusTrend]
    CH --> WT[WeakTopics]
    Profile --> IG[InsightsGrid]
    Profile --> RG[RecommendationsGrid]
    Profile --> AB[AchievementBadges]
    Profile --> WTT[WeakTopicsTags]
```

---

## Key Design Decisions

### 1. SQLite over PostgreSQL

FocusPilot uses SQLite as its primary data store rather than a networked database like PostgreSQL. This choice prioritizes a local-first architecture that eliminates infrastructure cost entirely — there is no database server to provision, maintain, or secure. Because all student data remains on the host machine running the FastAPI backend (typically the student's own laptop or a single-user server), there is zero risk of cloud data leakage. For an application dealing with behavioral attention data for students who may be minors, this is a meaningful privacy guarantee rather than a convenience trade-off.

### 2. AWS Bedrock over Direct OpenAI

All LLM inference is routed through AWS Bedrock rather than calling OpenAI or Anthropic APIs directly. Bedrock provides enterprise-grade security controls, does not retain customer data for model training by default, and operates on HIPAA-eligible infrastructure — a critical consideration for an application that processes behavioral and cognitive performance data. This also provides provider flexibility: the underlying model can be swapped (e.g., Claude, Titan, Llama) without changing application code, and AWS IAM provides fine-grained access control unavailable in direct API key authentication.

### 3. Zustand with `persist` over Redux

Client state is managed with Zustand rather than Redux or React Context. Zustand eliminates the boilerplate of actions, reducers, and selectors while providing the same predictable state container semantics. The `persist` middleware with `partialize` allows precise control over which state slices are written to `localStorage` — for example, persisting the active session plan across page refreshes while excluding ephemeral UI state like overlay visibility. Unlike Context, Zustand subscriptions are selector-based, so components re-render only when the specific slice they consume changes, avoiding the cascade re-renders that context-based state causes in large component trees.

### 4. Sprint-Based Architecture

Sessions are structured as sequences of 15-minute focused sprints rather than open-ended study blocks. This maps directly to the attention window documented in clinical ADHD literature, where sustained voluntary attention degrades significantly beyond 15–20 minutes without an interruption or reward signal. Each sprint ends with a short spaced quiz, which serves a dual purpose: it reinforces working memory encoding before the trace decays (the testing effect), and it provides a behavioral completion signal that resets attentional resources for the next sprint. The sprint model also generates granular per-sprint performance data that feeds the spaced repetition scheduler and learning profile.

### 5. Behavioral Drift Detection over Biometric

Attention drift is detected through three behavioral proxies — prolonged inactivity, tab-hidden events, and scroll-thrash patterns — rather than through camera or microphone access. This design is deliberately camera-free and microphone-free. Biometric attention tracking (eye gaze, facial expression, ambient audio) is more accurate in laboratory conditions but introduces significant privacy risks, requires explicit permissions that many students will deny, and is inaccessible to students with certain disabilities. The three behavioral signals chosen are statistically significant correlates of off-task behavior that can be captured entirely through standard browser event APIs, with no additional hardware, no media permissions, and no data leaving the device during signal collection.
