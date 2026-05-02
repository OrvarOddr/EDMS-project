import client from './client'

export interface DocumentItemResponse {
  id: string
  code: string
  title: string
  description?: string | null
  document_type_id?: string | null
  expedient_id?: string | null
  confidentiality_level: string
  created_by_user_id: string
  owner_user_id: string
  created_at: string
  updated_at: string
  workflow_state_code?: string | null
  assignee_user_id?: string | null
}

export interface CreateDocumentPayload {
  title: string
  document_type_id: string
  description: string
  expedient_id?: string | null
}

export const createDocument = (payload: CreateDocumentPayload) =>
  client.post<DocumentItemResponse>('/documents', payload)

export const listDocuments = () =>
  client.get<DocumentItemResponse[]>('/documents')
