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
  archived_at?: string | null
  due_date?: string | null
  metadata_activity?: DocumentActivityItem[]
  workflow_state_code?: string | null
  assignee_user_id?: string | null
  assigned_user_ids?: string[]
  current_file_mime_type?: string | null
}

export interface DocumentActivityItem {
  id: string
  actor_user_id: string
  action: string
  changed_fields: string[]
  created_at: string
}

export interface DocumentDetailWorkflowAssignment {
  id: string
  user_id: string
  role_code: string
  assigned_by_user_id: string
  assigned_at: string
}

export interface DocumentDetailWorkflow {
  state_code?: string | null
  assignee_user_id?: string | null
  assignment_role_code?: string | null
  assignments: DocumentDetailWorkflowAssignment[]
}

export interface DocumentDetailFileItem {
  id: string
  document_id: string
  version_number: number
  file_id: string
  uploaded_by_user_id: string
  version_comment?: string | null
  checksum?: string | null
  is_current: boolean
  created_at: string
  original_filename?: string | null
  mime_type?: string | null
  size_bytes?: number | null
  uploaded_at?: string | null
}

export interface DocumentDetailTimelineItem {
  id: string
  actor_user_id?: string | null
  action: string
  body?: string | null
  note?: string | null
  created_at: string
}

export interface DocumentDetailPermissions {
  can_edit_metadata: boolean
  can_upload_version: boolean
  can_move_to_trash: boolean
  can_download_file: boolean
  can_comment: boolean
  can_assign_assignee: boolean
}

export interface DocumentDetailResponse {
  document: DocumentItemResponse
  workflow: DocumentDetailWorkflow
  files: DocumentDetailFileItem[]
  comments: DocumentDetailTimelineItem[]
  history: DocumentDetailTimelineItem[]
  permissions: DocumentDetailPermissions
}

export interface CreateDocumentPayload {
  title: string
  document_type_id: string
  description: string
  expedient_id?: string | null
  confidentiality_level: string
  assignee_user_id?: string | null
}

export interface UpdateDocumentMetadataPayload {
  title: string
  document_type_id: string
  description: string
  expedient_id?: string | null
  confidentiality_level: string
  due_date?: string | null
}

export interface ListDocumentsParams {
  q?: string
  document_type_id?: string
  state_code?: string
  assignee_user_id?: string
  assigned_user_id?: string
  date?: string
}

export const createDocument = (payload: CreateDocumentPayload) =>
  client.post<DocumentItemResponse>('/documents', payload)

export const listDocuments = (params?: string | ListDocumentsParams) => {
  const requestParams = typeof params === 'string' ? { q: params } : (params ?? {})
  const cleanedParams = Object.fromEntries(
    Object.entries(requestParams)
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
      .filter(([, value]) => Boolean(value)),
  )

  return client.get<DocumentItemResponse[]>('/documents', {
    params: Object.keys(cleanedParams).length > 0 ? cleanedParams : undefined,
  })
}

export const getDocumentDetail = (documentId: string) =>
  client.get<DocumentDetailResponse>(`/documents/${documentId}`)

export const updateDocumentMetadata = (documentId: string, payload: UpdateDocumentMetadataPayload) =>
  client.patch<DocumentItemResponse>(`/documents/${documentId}/metadata`, payload)

export const listTrashedDocuments = () =>
  client.get<DocumentItemResponse[]>('/documents/trash')

export const moveDocumentToTrash = (documentId: string) =>
  client.patch<DocumentItemResponse>(`/documents/${documentId}/trash`)

export const restoreDocumentFromTrash = (documentId: string) =>
  client.patch<DocumentItemResponse>(`/documents/${documentId}/restore`)

export const permanentlyDeleteDocument = (documentId: string) =>
  client.delete<{ deleted_count: number }>(`/documents/${documentId}`)

export const createComment = (
  documentId: string,
  body: string,
  versionId?: string | null,
  mentionedUserIds: string[] = [],
) =>
  client.post<DocumentDetailTimelineItem>(`/collaboration/documents/${documentId}/comments`, {
    body,
    version_id: versionId ?? null,
    mentioned_user_ids: mentionedUserIds,
  })
