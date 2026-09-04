import type { ReactNode } from 'react'
import { useAuth } from './useAuth'
import type { UserRole } from './AuthContext'

interface Props {
  allowedRoles: UserRole[]
  children: ReactNode
  fallback?: ReactNode
}

export default function RoleGuard({ allowedRoles, children, fallback = null }: Props) {
  const { user } = useAuth()
  if (!user || !allowedRoles.includes(user.role)) return <>{fallback}</>
  return <>{children}</>
}
