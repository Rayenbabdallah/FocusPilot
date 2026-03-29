export type MaterialType = 'pdf' | 'video' | 'slides' | 'text'
export type SessionStatus = 'active' | 'completed' | 'abandoned'
export type SprintStatus = 'pending' | 'active' | 'completed'

export interface Student {
  id: string; name: string; email: string; created_at: string
}

export interface MaterialListItem {
  id: string; title: string; type: MaterialType; chunk_count: number
  created_at: string; subject?: string | null
}

export interface UploadResponse {
  material_id: string; title: string; type: string; chunk_count: number; preview: string
}

export interface ContentChunk {
  index: number; text: string; original_text?: string
  word_count: number; material_title?: string; title?: string
}

export interface SprintPlan {
  title: string; duration_minutes: number; focus: string
  material_hint: string; content_chunk?: ContentChunk; material_id?: string
}

export interface SessionPlan {
  sprints: SprintPlan[]; total_sprints: number
}

export interface SessionStartResponse {
  session_id: string; plan: SessionPlan; first_task: string
  first_sprint_id: string | null; first_chunk: ContentChunk
  materials_used?: { id: string; title: string }[]
}

export interface Sprint {
  id: string; session_id: string; material_id: string | null
  sprint_number: number; duration_minutes: number
  content_chunk: ContentChunk | null; status: SprintStatus
  started_at: string | null; ended_at: string | null
}

export interface SprintStartResponse {
  sprint_id: string; material_id: string | null; chunk: ContentChunk
  sprint_number: number; objective: string; duration_minutes: number
}

export interface RetentionSnapshot {
  overall_retention: number; strong_areas: string[]
  weak_areas: string[]; summary: string; recommendation: string
}

export interface CompleteSprintResponse {
  retention_snapshot: RetentionSnapshot
  next_sprint_id: string | null; is_session_done: boolean
}

export interface StudySession {
  id: string; student_id: string; goal: string
  planned_sprints: SprintPlan[] | null; status: SessionStatus
  started_at: string; ended_at: string | null
  sprints?: Sprint[]
}

export interface DriftEvent {
  id: string; session_id: string; sprint_id: string | null
  detected_at: string; signal_type: string
  resolved: boolean; resolved_at: string | null
}

export interface QuizQuestion {
  question: string; options: string[]
  correct_answer: string; explanation: string
}

export interface Quiz {
  id: string; sprint_id: string; session_id: string
  questions: QuizQuestion[] | null; answers: string[] | null
  score: number | null; completed_at: string | null
}

export interface GenerateQuizResponse {
  quiz_id: string; questions: QuizQuestion[]
}

export interface GradeQuizResponse {
  score: number; total: number
  correct_indices: number[]; wrong_indices: number[]
  explanations: string[]
}

export interface SpacedRepetitionItem {
  item_id: string; ease_factor: number; interval_days: number
  times_correct: number; times_wrong: number; next_review_at: string
  question: string; options: string[]
  correct_answer: string; explanation: string
}

export interface ReviewQueueResponse {
  items_due: number; questions: SpacedRepetitionItem[]
}

export interface SessionHistoryItem {
  session_id: string; goal: string
  started_at: string | null; ended_at: string | null
  total_sprints: number; avg_score: number | null; status: SessionStatus
  materials_covered?: { id: string; title: string; subject?: string | null }[]
}

export interface LearningProfile {
  id: string; student_id: string
  avg_focus_duration_minutes: number
  best_focus_time_of_day: string | null
  preferred_content_format: string | null
  weak_topics: string[] | null; total_sessions: number
  total_study_minutes: number; updated_at: string
  stats?: ProfileStats
}

export interface ProfileStats {
  total_sessions: number; total_study_minutes: number
  avg_retention_score: number; items_due_for_review: number
  topics_mastered_count: number; sessions_streak: number
  best_streak: number; last_study_days_ago: number | null
}

export interface TutorMessage {
  role: 'user' | 'assistant'; text: string; timestamp: string
}

export interface CloseSessionResponse {
  total_time_minutes: number; avg_score: number
  topics_covered: string[]; final_snapshot: RetentionSnapshot
  sessions_streak: number
}
