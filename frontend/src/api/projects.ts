import client from './client'

export interface ProjectItem {
  id: string
  name: string
  code?: string | null
  description?: string | null
  created_by_user_id: string
  created_at: string
  // Derivados (los llena GET /projects).
  document_count?: number | null
  member_user_ids?: string[]
  progress?: number | null
  status?: string | null // activo | en-riesgo | en-pausa | completado
  pending_count?: number | null
  updated_at?: string | null
}

export interface CreateProjectPayload {
  name: string
  code?: string | null
  description?: string | null
}

export const listProjects = () => client.get<ProjectItem[]>('/projects')

export const createProject = (payload: CreateProjectPayload) =>
  client.post<ProjectItem>('/projects', payload)
