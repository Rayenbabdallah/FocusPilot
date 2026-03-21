import client from './client'
import type {
  SessionStartResponse,
  SprintStartResponse,
  CompleteSprintResponse,
  CloseSessionResponse,
  SessionHistoryItem,
  TutorMessage,
  SessionPlan,
} from '../types'

export interface ActiveSessionResponse {
  session_id: string
  student_id: string
  goal: string
  status: string
  started_at: string
  ended_at: string | null
  plan: SessionPlan
  first_sprint_id: string | null
}

export interface StartSessionPayload {
  student_id: string
  goal: string
  material_ids: string[]
  available_minutes: number
}

export async function startSession(payload: StartSessionPayload): Promise<SessionStartResponse> {
  const response = await client.post<SessionStartResponse>('/sessions/start', payload)
  return response.data
}

export async function startSprint(
  sessionId: string,
  sprintId: string
): Promise<SprintStartResponse> {
  const response = await client.post<SprintStartResponse>(
    `/sessions/${sessionId}/sprint/${sprintId}/start`
  )
  return response.data
}

export async function completeSprint(
  sessionId: string,
  sprintId: string,
  quizScore: number,
  topicsCovered: string[]
): Promise<CompleteSprintResponse> {
  const response = await client.post<CompleteSprintResponse>(
    `/sessions/${sessionId}/sprint/${sprintId}/complete`,
    { quiz_score: quizScore, topics_covered: topicsCovered }
  )
  return response.data
}

export async function recordDrift(
  sessionId: string,
  sprintId: string,
  signalType: string
): Promise<{ reanchor_question: string }> {
  const response = await client.post<{ reanchor_question: string }>(
    `/sessions/${sessionId}/drift`,
    { sprint_id: sprintId, signal_type: signalType }
  )
  return response.data
}

export async function askTutor(
  sessionId: string,
  question: string,
  currentContent: string,
  conversationHistory: TutorMessage[]
): Promise<{ answer: string }> {
  const response = await client.post<{ answer: string }>(`/sessions/${sessionId}/tutor`, {
    question,
    current_content: currentContent,
    conversation_history: conversationHistory,
  })
  return response.data
}

export async function closeSession(sessionId: string): Promise<CloseSessionResponse> {
  const response = await client.post<CloseSessionResponse>(`/sessions/${sessionId}/close`)
  return response.data
}

export async function getSessionHistory(studentId: string): Promise<SessionHistoryItem[]> {
  const response = await client.get<SessionHistoryItem[]>(`/sessions/${studentId}/history`)
  return response.data
}

export async function getActiveSession(studentId: string): Promise<ActiveSessionResponse | null> {
  try {
    const response = await client.get<ActiveSessionResponse>(`/sessions/active/${studentId}`)
    return response.data
  } catch {
    return null
  }
}

export async function reexplainChunk(
  sessionId: string,
  chunkText: string,
): Promise<{ explanation: string }> {
  const response = await client.post<{ explanation: string }>(
    `/sessions/${sessionId}/reexplain`,
    { chunk_text: chunkText }
  )
  return response.data
}
