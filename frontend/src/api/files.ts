import client from './client'

export interface FileUploadResponse {
  file: {
    id: string
    original_filename: string
    mime_type: string
    size_bytes: number
    checksum?: string | null
    uploaded_at: string
  }
  upload_id: string
  document_id?: string | null
  document_version_id?: string | null
  version_number?: number | null
}

export interface StoredFileItem {
  id: string
  original_filename: string
  mime_type: string
  size_bytes: number
  checksum?: string | null
  uploaded_at: string
  upload_id: string
  upload_status: string
  document_id?: string | null
  document_version_id?: string | null
}

export interface DocumentFromFileResponse {
  document_id: string
  document_title: string
  document_version_id: string
  file: FileUploadResponse['file']
}

export interface UploadDocumentFilePayload {
  file: File
  document_id?: string | null
  version_comment?: string
}

export const uploadDocumentFile = (payload: UploadDocumentFilePayload) => {
  const form = new FormData()
  form.append('file', payload.file)
  if (payload.document_id) form.append('document_id', payload.document_id)
  if (payload.version_comment?.trim()) form.append('version_comment', payload.version_comment.trim())

  return client.post<FileUploadResponse>('/files/upload', form)
}

export const listUnassignedFiles = () =>
  client.get<StoredFileItem[]>('/files/unassigned')

export const listTrashedFiles = () =>
  client.get<StoredFileItem[]>('/files/trash')

export const moveFileToTrash = (fileId: string) =>
  client.patch<StoredFileItem>(`/files/${fileId}/trash`)

export const createDocumentFromFile = (fileId: string) =>
  client.post<DocumentFromFileResponse>(`/files/${fileId}/document`, {})

export const getFileContent = (fileId: string, signal?: AbortSignal) =>
  client.get<Blob>(`/files/${fileId}/content`, {
    responseType: 'blob',
    signal,
  })
