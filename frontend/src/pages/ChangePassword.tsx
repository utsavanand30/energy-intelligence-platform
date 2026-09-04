import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Zap, Loader2, ShieldCheck } from 'lucide-react'
import PasswordStrength from '../components/auth/PasswordStrength'
import { authApi } from '../api/auth'
import { useAuth } from '../auth/useAuth'

export default function ChangePassword() {
  const { refreshUser } = useAuth()
  const navigate = useNavigate()
  const [current, setCurrent] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPwd !== confirmPwd) { setError("Passwords don't match"); return }
    setIsLoading(true); setError('')
    try {
      await authApi.changePassword({ current_password: current, new_password: newPwd, confirm_password: confirmPwd })
      await refreshUser()
      navigate('/', { replace: true })
    } catch (err: any) {
      const detail = err.response?.data
      if (detail?.error === 'INVALID_CREDENTIALS') {
        setError('Current password is incorrect.')
      } else if (detail?.error === 'SAME_PASSWORD') {
        setError('New password must differ from your current password.')
      } else if (detail?.error === 'PASSWORD_COMPLEXITY_FAILED') {
        setError(detail.details?.join(' ') ?? 'Password does not meet requirements.')
      } else {
        setError('Failed to change password. Please try again.')
      }
    } finally { setIsLoading(false) }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-950 px-4">
      <div className="w-full max-w-[400px] space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
            <Zap size={16} className="text-white" />
          </div>
          <span className="text-lg font-bold text-white">EnergyIQ</span>
        </div>

        <div className="card p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
              <ShieldCheck size={20} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Change your password</h2>
              <p className="text-xs text-amber-400">Required before you can access the platform</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-950/50 border border-red-800/60 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Current */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-surface-400">Current Password</label>
              <div className="relative">
                <input type={showCurrent ? 'text' : 'password'} value={current}
                  onChange={e => setCurrent(e.target.value)} placeholder="••••••••"
                  className="input-field w-full pr-10" required />
                <button type="button" onClick={() => setShowCurrent(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300">
                  {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* New */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-surface-400">New Password</label>
              <div className="relative">
                <input type={showNew ? 'text' : 'password'} value={newPwd}
                  onChange={e => setNewPwd(e.target.value)} placeholder="••••••••"
                  className="input-field w-full pr-10" required minLength={8} />
                <button type="button" onClick={() => setShowNew(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300">
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <PasswordStrength password={newPwd} />
            </div>

            {/* Confirm */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-surface-400">Confirm New Password</label>
              <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                placeholder="••••••••" className="input-field w-full" required />
            </div>

            <button type="submit" disabled={isLoading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold disabled:opacity-60">
              {isLoading && <Loader2 size={15} className="animate-spin" />}
              {isLoading ? 'Saving…' : 'Change Password & Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
