import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getMe, login as apiLogin, logout as apiLogout, type UserMe } from '../api/auth'

interface AuthState {
  user: UserMe | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserMe | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    ;(token
      ? getMe()
          .then((r) => setUser(r.data))
          .catch(() => {
            localStorage.removeItem('access_token')
            localStorage.removeItem('refresh_token')
          })
      : Promise.resolve()
    ).finally(() => setLoading(false))
  }, [])

  async function login(email: string, password: string) {
    const { data } = await apiLogin(email, password)
    const me = await getMe(data.access_token)
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    setUser(me.data)
  }

  async function logout() {
    const refresh = localStorage.getItem('refresh_token')
    if (refresh) await apiLogout(refresh).catch(() => {})
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
