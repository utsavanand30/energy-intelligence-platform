import { useState, useEffect } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Zap, Loader2, CheckCircle2 } from 'lucide-react'
import PasswordStrength from '../components/auth/PasswordStrength'
import { authApi } from '../api/auth'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token')

  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) setError('Invalid or missing reset token.')
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPwd !== confirmPwd) { setError("Passwords don't match"); return }
    setIsLoading(true); setError('')
    try {
      await authApi.confirmPasswordReset({ token: token!, new_password: newPwd, confirm_password: confirmPwd })
      setDone(true)
      setTimeout(() => navigate('/login'), 3000)
    } catch (err: any) {
      const detail = err.response?.data
      if (detail?.error === 'RESET_TOKEN_EXPIRED') {
        setError('This reset link has expired. Please request a new one.')
      } else if (detail?.error === 'PASSWORD_COMPLEXITY_FAILED') {
        setError(detail.details?.join(' ') ?? 'Password does not meet requirements.')
      } else {
        setError('Reset failed. The link may be invalid or expired.')
      }
    } finally { setIsLoading(false) }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-950 px-4">
      <div className="w-full max-w-[380px] space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
            <Zap size={16} className="text-white" />
          </div>
          <span className="text-lg font-bold text-white">EnergyIQ</span>
        </div>
        <div className="card p-8 shadow-2xl">
          {done ? (
            <div className="text-center space-y-4">
              <CheckCircle2 className="mx-auto text-emerald-400" size={40} />
              <h2 className="text-lg font-bold text-white">Password changed</h2>
              <p className="text-sm text-surface-400">Redirecting you to sign in…</p>
            </div>
          ) : (
            <>
              <div className="mb-5">
                <h2 className="text-lg font-bold text-white">Set new password</h2>
                <p className="text-sm text-surface-400 mt-1">Choose a strong, unique password.</p>
              </div>
              {error && (
                <div className="mb-4 rounded-lg bg-red-950/50 border border-red-800/60 px-4 py-3 text-sm text-red-300">
                  {error}{' '}
                  {error.includes('expired') && (
                    <Link to="/forgot-password" className="underline text-red-200">Request new link</Link>
                  )}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-surface-400">New Password</label>
                  <div className="relative">
                    <input type={showPwd ? 'text' : 'password'} value={newPwd}
                      onChange={e => setNewPwd(e.target.value)} placeholder="••••••••"
                      className="input-field w-full pr-10" required minLength={8} />
                    <button type="button" onClick={() => setShowPwd(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300">
                      {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <PasswordStrength password={newPwd} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-surface-400">Confirm Password</label>
                  <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                    placeholder="••••••••" className="input-field w-full" required />
                </div>
                <button type="submit" disabled={isLoading || !token}
                  className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold disabled:opacity-60">
                  {isLoading && <Loader2 size={15} className="animate-spin" />}
                  {isLoading ? 'Resetting…' : 'Reset Password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
