import { type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'
import type { UserRole } from './AuthContext'

interface Props {
  children: ReactNode
  requiredRole?: UserRole | UserRole[]
}

function FullScreenSpinner() {
  return (
    <div className="flex items-center justify-center h-screen bg-surface-950">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-surface-500">Loading…</p>
      </div>
    </div>
  )
}

export default function ProtectedRoute({ children, requiredRole }: Props) {
  const { user, isLoading, isAuthenticated } = useAuth()
  const location = useLocation()

  if (isLoading) return <FullScreenSpinner />

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Force password change before accessing anything else
  if (user!.must_reset_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  // Role guard
  if (requiredRole) {
    const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
    if (!allowed.includes(user!.role)) {
      return <Navigate to="/unauthorized" replace />
    }
  }

  return <>{children}</>
}
