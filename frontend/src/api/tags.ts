import client from './client'

export interface Tag {
  id: string
  label: string
  color: string
  created_by_user_id: string
}

export const listTags = () =>
  client.get<Tag[]>('/tags')

export const createTag = (label: string, color: string) =>
  client.post<Tag>('/tags', { label, color })

export const updateTag = (tagId: string, label: string, color: string) =>
  client.put<Tag>(`/tags/${tagId}`, { label, color })

export const deleteTag = (tagId: string) =>
  client.delete(`/tags/${tagId}`)

export const getDocumentTags = (documentId: string) =>
  client.get<Tag[]>(`/documents/${documentId}/tags`)

export const assignTagToDocument = (documentId: string, tagId: string) =>
  client.post(`/documents/${documentId}/tags/${tagId}`, {})

export const removeTagFromDocument = (documentId: string, tagId: string) =>
  client.delete(`/documents/${documentId}/tags/${tagId}`)
