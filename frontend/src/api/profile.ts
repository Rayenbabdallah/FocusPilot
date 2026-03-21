import client from './client'
import type { LearningProfile, Student } from '../types'

export async function getProfile(studentId: string): Promise<LearningProfile> {
  const response = await client.get<LearningProfile>(`/profile/${studentId}`)
  return response.data
}

export async function createStudent(name: string, email: string): Promise<Student> {
  const response = await client.post<Student>('/students', { name, email })
  return response.data
}

export async function getStudent(studentId: string): Promise<Student> {
  const response = await client.get<Student>(`/students/${studentId}`)
  return response.data
}
