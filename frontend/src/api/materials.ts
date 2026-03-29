import client from './client'
import type { MaterialListItem, UploadResponse, ContentChunk } from '../types'

export async function uploadMaterial(
  file: File,
  studentId: string,
  title: string,
  subject?: string,
): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('student_id', studentId)
  formData.append('title', title)
  if (subject?.trim()) formData.append('subject', subject.trim())

  const response = await client.post<UploadResponse>('/materials/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 180000, // 3 minutes — large PDFs need time for AI processing
  })
  return response.data
}

export async function updateMaterialSubject(
  materialId: string,
  studentId: string,
  subject: string,
): Promise<void> {
  await client.patch(`/materials/${materialId}/subject`, { subject }, { params: { student_id: studentId } })
}

export async function getMaterials(studentId: string): Promise<MaterialListItem[]> {
  const response = await client.get<MaterialListItem[]>(`/materials/${studentId}`)
  return response.data
}

export async function getMaterialChunks(
  materialId: string,
  studentId: string,
): Promise<{ material_id: string; title: string; chunks: ContentChunk[] }> {
  const response = await client.get<{ material_id: string; title: string; chunks: ContentChunk[] }>(
    `/materials/${materialId}/chunks`,
    { params: { student_id: studentId } }
  )
  return response.data
}

export async function deleteMaterial(materialId: string, studentId: string): Promise<{ deleted: boolean }> {
  const response = await client.delete<{ deleted: boolean }>(`/materials/${materialId}`, {
    params: { student_id: studentId },
  })
  return response.data
}

export async function getCheatsheet(
  materialId: string,
  studentId: string,
): Promise<{ material_id: string; title: string; cheatsheet: string }> {
  const response = await client.get<{ material_id: string; title: string; cheatsheet: string }>(
    `/materials/${materialId}/cheatsheet`,
    { params: { student_id: studentId } }
  )
  return response.data
}
