import client from './client'
import type { DocumentItemResponse } from './documents'

export interface ExpedientItem {
  id: string
  name: string
  code?: string | null
  description?: string | null
  created_by_user_id: string
  created_at: string
}

export interface ExpedientDetail extends ExpedientItem {
  documents: DocumentItemResponse[]
}

export interface CreateExpedientPayload {
  name: string
  code?: string | null
  description?: string | null
}

export const listExpedients = () =>
  client.get<ExpedientItem[]>('/expedients')

export const getExpedient = (id: string) =>
  client.get<ExpedientDetail>(`/expedients/${id}`)

export const createExpedient = (payload: CreateExpedientPayload) =>
  client.post<ExpedientItem>('/expedients', payload)
