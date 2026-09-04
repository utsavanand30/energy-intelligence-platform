import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Zap, Loader2, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'
import PasswordStrength from '../components/auth/PasswordStrength'
import { authApi } from '../api/auth'

const schema = z.object({
  full_name:        z.string().min(2, 'Full name must be at least 2 characters'),
  email:            z.string().email('Enter a valid email address'),
  username:         z.string().min(3, 'Username must be 3+ characters').regex(/^[a-zA-Z0-9_-]+$/, 'Only letters, numbers, _ and -'),
  password:         z.string().min(8, 'At least 8 characters'),
  confirm_password: z.string(),
}).refine(d => d.password === d.confirm_password, {
  message: "Passwords don't match",
  path: ['confirm_password'],
})
type FormValues = z.infer<typeof schema>

export default function Register() {
  const navigate = useNavigate()
  const [showPwd, setShowPwd] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })
  const password = watch('password', '')

  const onSubmit = async (values: FormValues) => {
    setIsLoading(true)
    setErrorMessage('')
    try {
      await authApi.register(values)
      setSuccess(true)
    } catch (err: any) {
      const detail = err.response?.data
      if (detail?.error === 'USERNAME_ALREADY_EXISTS') {
        setErrorMessage('That username is already taken.')
      } else if (detail?.error === 'EMAIL_ALREADY_EXISTS') {
        setErrorMessage('An account with that email already exists.')
      } else if (detail?.error === 'PASSWORD_COMPLEXITY_FAILED') {
        setErrorMessage(detail.details?.join(' ') ?? 'Password does not meet requirements.')
      } else {
        setErrorMessage('Registration failed. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-950 px-4">
        <div className="card p-8 max-w-sm w-full text-center space-y-4">
          <CheckCircle2 className="mx-auto text-emerald-400" size={48} />
          <h2 className="text-xl font-bold text-white">Check your email</h2>
          <p className="text-sm text-surface-400">
            We've sent a verification link to your email address. Click it to activate your account.
          </p>
          <Link to="/login" className="btn-primary inline-block px-6 py-2.5 text-sm font-semibold rounded-lg">
            Back to Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-950 px-4 py-8">
      <div className="w-full max-w-[400px] space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
            <Zap size={16} className="text-white" />
          </div>
          <span className="text-lg font-bold text-white">EnergyIQ</span>
        </div>

        <div className="card p-8 shadow-2xl space-y-5">
          <div>
            <h2 className="text-xl font-bold text-white">Create your account</h2>
            <p className="text-sm text-surface-400 mt-1">Join EnergyIQ — it's free</p>
          </div>

          {errorMessage && (
            <div className="rounded-lg bg-red-950/50 border border-red-800/60 px-4 py-3 text-sm text-red-300">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {/* Full name */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-surface-400">Full Name</label>
              <input {...register('full_name')} placeholder="Jane Smith"
                className={clsx('input-field w-full', errors.full_name && 'border-red-600')} />
              {errors.full_name && <p className="text-[11px] text-red-400">{errors.full_name.message}</p>}
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-surface-400">Email</label>
              <input {...register('email')} type="email" placeholder="you@company.com"
                className={clsx('input-field w-full', errors.email && 'border-red-600')} />
              {errors.email && <p className="text-[11px] text-red-400">{errors.email.message}</p>}
            </div>

            {/* Username */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-surface-400">Username</label>
              <input {...register('username')} placeholder="janesmith"
                className={clsx('input-field w-full', errors.username && 'border-red-600')} />
              {errors.username && <p className="text-[11px] text-red-400">{errors.username.message}</p>}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-surface-400">Password</label>
              <div className="relative">
                <input {...register('password')} type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  className={clsx('input-field w-full pr-10', errors.password && 'border-red-600')} />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300">
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.password && <p className="text-[11px] text-red-400">{errors.password.message}</p>}
              <PasswordStrength password={password} />
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-surface-400">Confirm Password</label>
              <input {...register('confirm_password')} type="password" placeholder="••••••••"
                className={clsx('input-field w-full', errors.confirm_password && 'border-red-600')} />
              {errors.confirm_password && <p className="text-[11px] text-red-400">{errors.confirm_password.message}</p>}
            </div>

            <button type="submit" disabled={isLoading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold disabled:opacity-60">
              {isLoading && <Loader2 size={15} className="animate-spin" />}
              {isLoading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-surface-500">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
