import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import clsx from 'clsx'

const schema = z.object({
  identifier: z.string().min(1, 'Username or email is required'),
  password:   z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
})
type FormValues = z.infer<typeof schema>

interface Props {
  onSubmit: (identifier: string, password: string, rememberMe: boolean) => Promise<void>
  isLoading?: boolean
  errorMessage?: string
}

export default function LoginForm({ onSubmit, isLoading, errorMessage }: Props) {
  const [showPwd, setShowPwd] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const submit = async (v: FormValues) => {
    await onSubmit(v.identifier, v.password, v.rememberMe ?? false)
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      {/* Error banner */}
      {errorMessage && (
        <div className="rounded-lg bg-red-950/50 border border-red-800/60 px-4 py-3 text-sm text-red-300">
          {errorMessage}
        </div>
      )}

      {/* Identifier */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-surface-400" htmlFor="identifier">
          Email or Username
        </label>
        <input
          id="identifier"
          type="text"
          autoComplete="username"
          placeholder="you@company.com"
          {...register('identifier')}
          className={clsx(
            'input-field w-full',
            errors.identifier && 'border-red-600 focus:border-red-500',
          )}
        />
        {errors.identifier && (
          <p className="text-[11px] text-red-400">{errors.identifier.message}</p>
        )}
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-surface-400" htmlFor="password">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPwd ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            {...register('password')}
            className={clsx(
              'input-field w-full pr-10',
              errors.password && 'border-red-600',
            )}
          />
          <button
            type="button"
            onClick={() => setShowPwd(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
            aria-label={showPwd ? 'Hide password' : 'Show password'}
          >
            {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        {errors.password && (
          <p className="text-[11px] text-red-400">{errors.password.message}</p>
        )}
      </div>

      {/* Remember me + Forgot */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" {...register('rememberMe')}
            className="w-3.5 h-3.5 rounded border-surface-600 bg-surface-800 text-brand-600" />
          <span className="text-xs text-surface-400">Remember me for 7 days</span>
        </label>
        <a href="/forgot-password"
          className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
          Forgot password?
        </a>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading}
        className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isLoading && <Loader2 size={15} className="animate-spin" />}
        {isLoading ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  )
}
