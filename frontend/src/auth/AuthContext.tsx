import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { authApi, type AuthUser, type UserRole } from '../api/auth'

interface AuthContextType {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (identifier: string, password: string, rememberMe: boolean) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // On mount: check if a valid session exists
  useEffect(() => {
    authApi.me()
      .then((u) => {
        setUser(u)
        // Store token expiry for session timeout hook
        // Backend returns expires_at; alternatively derive from login response
      })
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false))
  }, [])

  const login = async (identifier: string, password: string, rememberMe: boolean) => {
    const data = await authApi.login({ identifier, password, remember_me: rememberMe })
    setUser(data.user)
    if (data.expires_at) {
      const exp = Math.floor(new Date(data.expires_at).getTime() / 1000)
      localStorage.setItem('token_exp', String(exp))
    }
  }

  const logout = async () => {
    await authApi.logout().catch(() => {})
    setUser(null)
    localStorage.removeItem('token_exp')
  }

  const refreshUser = async () => {
    const u = await authApi.me()
    setUser(u)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export { type UserRole, type AuthUser }
