import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Zap, Loader2, CheckCircle2 } from 'lucide-react'
import { authApi } from '../api/auth'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setIsLoading(true)
    try {
      await authApi.requestPasswordReset(email)
    } catch {}
    finally { setSent(true); setIsLoading(false) }
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
          {sent ? (
            <div className="text-center space-y-4">
              <CheckCircle2 className="mx-auto text-emerald-400" size={40} />
              <h2 className="text-lg font-bold text-white">Check your email</h2>
              <p className="text-sm text-surface-400">
                If an account exists for <span className="text-surface-200 font-medium">{email}</span>, you'll receive a reset link shortly.
              </p>
              <Link to="/login" className="block text-sm text-brand-400 hover:text-brand-300 mt-4">
                Back to Sign In
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-5">
                <h2 className="text-lg font-bold text-white">Forgot your password?</h2>
                <p className="text-sm text-surface-400 mt-1">Enter your email and we'll send a reset link.</p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-surface-400">Email address</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@company.com" className="input-field w-full" required />
                </div>
                <button type="submit" disabled={isLoading || !email}
                  className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold disabled:opacity-60">
                  {isLoading && <Loader2 size={15} className="animate-spin" />}
                  {isLoading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </form>
              <Link to="/login" className="block text-center text-xs text-surface-500 hover:text-surface-400 mt-4">
                ← Back to Sign In
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
