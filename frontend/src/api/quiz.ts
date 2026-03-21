import client from './client'
import type { GenerateQuizResponse, GradeQuizResponse, ReviewQueueResponse } from '../types'

export async function generateQuiz(
  sprintId: string,
  sessionId: string,
  contentChunkText: string
): Promise<GenerateQuizResponse> {
  const response = await client.post<GenerateQuizResponse>(`/quiz/generate/${sprintId}`, {
    session_id: sessionId,
    content_chunk_text: contentChunkText,
  })
  return response.data
}

export async function submitQuiz(
  quizId: string,
  answers: string[]
): Promise<GradeQuizResponse> {
  const response = await client.post<GradeQuizResponse>(`/quiz/${quizId}/submit`, { answers })
  return response.data
}

export async function getReviewQueue(studentId: string): Promise<ReviewQueueResponse> {
  const response = await client.get<ReviewQueueResponse>(`/quiz/review/${studentId}`)
  return response.data
}

export async function submitReviewResult(
  itemId: string,
  wasCorrect: boolean
): Promise<{ next_review_at: string; message: string }> {
  const response = await client.post<{ next_review_at: string; message: string }>(
    `/quiz/review/${itemId}/result`,
    { was_correct: wasCorrect }
  )
  return response.data
}
