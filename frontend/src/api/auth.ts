import client from './client'

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface UserMe {
  id: string
  email: string
  first_name: string
  last_name: string
  status: string
  is_superuser: boolean
  roles: string[]
}

export interface RoleItem {
  id: string
  code: string
  name: string
  description?: string | null
}

export interface CreateUserPayload {
  email: string
  password: string
  first_name: string
  last_name: string
  role_id: string
  status: 'active' | 'inactive' | 'blocked'
}

export interface AssignRolePayload {
  user_id: string
  role_id: string
}

export const login = (email: string, password: string) =>
  client.post<TokenResponse>('/auth/login', { email, password })

export const logout = (refresh_token: string) =>
  client.post('/auth/logout', { refresh_token })

export const getMe = (accessToken?: string) =>
  client.get<UserMe>('/users/me', accessToken ? {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  } : undefined)

export const listRoles = () =>
  client.get<RoleItem[]>('/roles')

export const createUser = (payload: CreateUserPayload) =>
  client.post<UserMe>('/users', payload)

export const listUsers = () =>
  client.get<UserMe[]>('/users')

export const assignRole = (payload: AssignRolePayload) =>
  client.post<UserMe>('/roles/assign', payload)
