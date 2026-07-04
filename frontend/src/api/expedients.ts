import client from './client'
import type { DocumentItemResponse } from './documents'

export interface ExpedientItem {
  id: string
  project_id?: string | null
  name: string
  code?: string | null
  description?: string | null
  created_by_user_id: string
  created_at: string
}

export interface ExpedientFolderItem {
  id: string
  expedient_id: string
  name: string
  created_by_user_id: string
  created_at: string
}

export interface ExpedientDetail extends ExpedientItem {
  documents: DocumentItemResponse[]
  folders: ExpedientFolderItem[]
}

export interface CreateExpedientPayload {
  name: string
  code?: string | null
  description?: string | null
  project_id?: string | null
}

export const listExpedients = (projectId?: string) =>
  client.get<ExpedientItem[]>('/expedients', projectId ? { params: { project_id: projectId } } : undefined)

export const getExpedient = (id: string) =>
  client.get<ExpedientDetail>(`/expedients/${id}`)

export const createExpedient = (payload: CreateExpedientPayload) =>
  client.post<ExpedientItem>('/expedients', payload)

export const deleteExpedient = (id: string) =>
  client.delete<{ deleted_count: number }>(`/expedients/${id}`)

export interface AttachDocumentsToExpedientResult {
  attached: string[]
  skipped: { document_id: string; reason: string }[]
}

export const attachDocumentsToExpedient = (expedientId: string, documentIds: string[]) =>
  client.post<AttachDocumentsToExpedientResult>(
    `/expedients/${expedientId}/documents`,
    { document_ids: documentIds },
  )

export const createExpedientFolder = (expedientId: string, name: string) =>
  client.post<ExpedientFolderItem>(`/expedients/${expedientId}/folders`, { name })

export const renameExpedientFolder = (expedientId: string, folderId: string, name: string) =>
  client.patch<ExpedientFolderItem>(`/expedients/${expedientId}/folders/${folderId}`, { name })

export const deleteExpedientFolder = (expedientId: string, folderId: string) =>
  client.delete<void>(`/expedients/${expedientId}/folders/${folderId}`)

export const moveDocumentToFolder = (documentId: string, folderId: string | null) =>
  client.patch(`/documents/${documentId}/folder`, { folder_id: folderId })
