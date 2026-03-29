import client from './client'
import type { GenerateQuizResponse, GradeQuizResponse, ReviewQueueResponse } from '../types'

export async function generateQuiz(
  sprintId: string,
  studentId: string,
  sessionId: string,
  contentChunkText: string
): Promise<GenerateQuizResponse> {
  const response = await client.post<GenerateQuizResponse>(`/quiz/generate/${sprintId}`, {
    student_id: studentId,
    session_id: sessionId,
    content_chunk_text: contentChunkText,
  })
  return response.data
}

export async function submitQuiz(
  quizId: string,
  studentId: string,
  answers: string[]
): Promise<GradeQuizResponse> {
  const response = await client.post<GradeQuizResponse>(`/quiz/${quizId}/submit`, {
    student_id: studentId,
    answers,
  })
  return response.data
}

export async function getReviewQueue(studentId: string): Promise<ReviewQueueResponse> {
  const response = await client.get<ReviewQueueResponse>(`/quiz/review/${studentId}`)
  return response.data
}

export async function submitReviewResult(
  itemId: string,
  studentId: string,
  wasCorrect: boolean
): Promise<{ next_review_at: string; message: string }> {
  const response = await client.post<{ next_review_at: string; message: string }>(
    `/quiz/review/${itemId}/result`,
    { student_id: studentId, was_correct: wasCorrect }
  )
  return response.data
}
