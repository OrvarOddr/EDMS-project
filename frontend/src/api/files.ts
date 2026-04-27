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

  return client.post<FileUploadResponse>('/files/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}
