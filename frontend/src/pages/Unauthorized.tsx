import { Link } from 'react-router-dom'
import { ShieldX } from 'lucide-react'
import { useAuth } from '../auth/useAuth'

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  ENERGY_ENGINEER: 'Energy Engineer',
  MAINTENANCE: 'Maintenance',
  OPERATOR: 'Operator',
  VIEWER: 'Viewer',
}

export default function Unauthorized() {
  const { user } = useAuth()
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-950 px-4">
      <div className="card p-8 max-w-sm w-full text-center space-y-5 shadow-2xl">
        <ShieldX size={48} className="mx-auto text-red-400" />
        <div>
          <h2 className="text-xl font-bold text-white">Access Denied</h2>
          <p className="text-sm text-surface-400 mt-2">
            You don't have permission to view this page.
          </p>
        </div>
        {user && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-800 border border-surface-700">
            <span className="text-[10px] text-surface-500">Your role:</span>
            <span className="text-xs font-semibold text-surface-200">
              {ROLE_LABELS[user.role] ?? user.role}
            </span>
          </div>
        )}
        <Link to="/" className="btn-primary inline-block px-6 py-2.5 text-sm font-semibold rounded-lg">
          Go to Dashboard
        </Link>
      </div>
    </div>
  )
}
