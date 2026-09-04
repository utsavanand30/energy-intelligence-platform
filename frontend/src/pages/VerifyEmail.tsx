import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Zap, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { authApi } from '../api/auth'

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('Invalid verification link.'); return }
    authApi.verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        const code = err.response?.data?.error
        setMessage(
          code === 'VERIFICATION_TOKEN_EXPIRED'
            ? 'This verification link has expired.'
            : 'Invalid or already-used verification link.'
        )
        setStatus('error')
      })
  }, [token])

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-950 px-4">
      <div className="w-full max-w-[380px]">
        <div className="card p-8 text-center shadow-2xl space-y-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <span className="text-lg font-bold text-white">EnergyIQ</span>
          </div>

          {status === 'loading' && (
            <>
              <Loader2 size={40} className="mx-auto text-brand-400 animate-spin" />
              <p className="text-sm text-surface-400">Verifying your email…</p>
            </>
          )}
          {status === 'success' && (
            <>
              <CheckCircle2 size={40} className="mx-auto text-emerald-400" />
              <h2 className="text-lg font-bold text-white">Email verified!</h2>
              <p className="text-sm text-surface-400">Your account is active. You can now sign in.</p>
              <Link to="/login" className="btn-primary inline-block px-6 py-2.5 text-sm font-semibold rounded-lg">
                Sign In
              </Link>
            </>
          )}
          {status === 'error' && (
            <>
              <XCircle size={40} className="mx-auto text-red-400" />
              <h2 className="text-lg font-bold text-white">Verification failed</h2>
              <p className="text-sm text-surface-400">{message}</p>
              {message.includes('expired') && (
                <p className="text-xs text-surface-500">Contact your admin to resend the verification email.</p>
              )}
              <Link to="/login" className="block text-sm text-brand-400 hover:text-brand-300 mt-2">
                Back to Sign In
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
