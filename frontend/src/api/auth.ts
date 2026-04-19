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

export const login = (email: string, password: string) =>
  client.post<TokenResponse>('/auth/login', { email, password })

export const logout = (refresh_token: string) =>
  client.post('/auth/logout', { refresh_token })

export const getMe = () =>
  client.get<UserMe>('/users/me')
