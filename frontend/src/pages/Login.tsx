import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Zap, BarChart3, Bell, Building2, TrendingUp } from 'lucide-react'
import LoginForm from '../components/auth/LoginForm'
import SSOButtons from '../components/auth/SSOButtons'
import { useAuth } from '../auth/useAuth'

export default function Login() {
  const { login, isAuthenticated, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Check for SSO error in URL
  const ssoError = new URLSearchParams(location.search).get('error')
  const sessionExpired = new URLSearchParams(location.search).get('reason') === 'session_expired'

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const from = (location.state as any)?.from?.pathname ?? '/'
      navigate(user?.must_reset_password ? '/change-password' : from, { replace: true })
    }
  }, [isAuthenticated])

  const handleLogin = async (identifier: string, password: string, rememberMe: boolean) => {
    setIsLoading(true)
    setErrorMessage('')
    try {
      await login(identifier, password, rememberMe)
    } catch (err: any) {
      const detail = err.response?.data
      if (detail?.error === 'ACCOUNT_LOCKED') {
        setErrorMessage(detail.message)
      } else if (detail?.error === 'EMAIL_NOT_VERIFIED') {
        setErrorMessage('Please verify your email before logging in.')
      } else {
        setErrorMessage('Invalid username or password. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-surface-950">
      {/* ── Left branding panel (desktop only) ───────────────── */}
      <div className="hidden lg:flex lg:flex-col lg:justify-between w-[55%] relative overflow-hidden
                      bg-gradient-to-br from-surface-950 via-surface-900 to-brand-950 px-12 py-10">
        {/* Background grid pattern */}
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #6366f1 1px, transparent 0)',
                   backgroundSize: '32px 32px' }} />

        {/* Logo */}
        <div className="relative flex items-center gap-3 z-10">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg">
            <Zap size={20} className="text-white" />
          </div>
          <div>
            <div className="text-xl font-bold text-white">EnergyIQ</div>
            <div className="text-xs text-surface-500">Cable Plant Monitor</div>
          </div>
        </div>

        {/* Main content */}
        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="text-4xl font-bold text-white leading-tight mb-3">
              Intelligent Energy<br />Management
            </h1>
            <p className="text-surface-400 text-base leading-relaxed max-w-md">
              Real-time monitoring and analytics for cable manufacturing plants.
              Reduce energy costs, improve power quality, and make data-driven decisions.
            </p>
          </div>

          <div className="space-y-4">
            {[
              { icon: BarChart3, text: 'Live power & energy metrics across 60+ meters' },
              { icon: TrendingUp, text: 'Advanced analytics with week-over-week comparison' },
              { icon: Bell,      text: 'Intelligent alert management and notifications' },
              { icon: Building2, text: 'Multi-section hierarchy — shed, section, machine' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand-600/20 flex items-center justify-center shrink-0">
                  <Icon size={15} className="text-brand-400" />
                </div>
                <span className="text-sm text-surface-300">{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-xs text-surface-600">
          Polycab India Limited · Daman Manufacturing Unit 2
        </div>
      </div>

      {/* ── Right login panel ────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-4 py-8 lg:px-12">
        <div className="w-full max-w-[400px] space-y-6">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <span className="text-lg font-bold text-white">EnergyIQ</span>
          </div>

          {/* Card */}
          <div className="card p-8 shadow-2xl">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-white">Welcome back</h2>
              <p className="text-sm text-surface-400 mt-1">Sign in to EnergyIQ</p>
            </div>

            {/* SSO/session banners */}
            {sessionExpired && (
              <div className="mb-4 rounded-lg bg-amber-950/40 border border-amber-800/40 px-4 py-3 text-sm text-amber-300">
                Your session expired. Please sign in again.
              </div>
            )}
            {ssoError && (
              <div className="mb-4 rounded-lg bg-red-950/40 border border-red-800/40 px-4 py-3 text-sm text-red-300">
                {ssoError === 'sso_cancelled' ? 'Sign-in was cancelled.' :
                 ssoError === 'sso_state_mismatch' ? 'Security check failed. Please try again.' :
                 'SSO sign-in failed. Please try again or use your password.'}
              </div>
            )}

            <LoginForm
              onSubmit={handleLogin}
              isLoading={isLoading}
              errorMessage={errorMessage}
            />

            {/* Divider */}
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-surface-800" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-surface-900 px-3 text-xs text-surface-500">or continue with</span>
              </div>
            </div>

            <SSOButtons disabled={isLoading} />
          </div>

          {/* Register link */}
          <p className="text-center text-sm text-surface-500">
            New to EnergyIQ?{' '}
            <Link to="/register" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
