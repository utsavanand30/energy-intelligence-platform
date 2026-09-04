import clsx from 'clsx'

interface Props {
  password: string
}

function getStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: '', color: '' }
  let score = 0
  if (password.length >= 8)  score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password)) score++
  if (/[a-z]/.test(password)) score++
  if (/\d/.test(password))     score++
  if (/[@$!%*?&]/.test(password)) score++

  if (score <= 2) return { score, label: 'Weak',   color: 'bg-red-500'    }
  if (score <= 3) return { score, label: 'Fair',   color: 'bg-amber-500'  }
  if (score <= 4) return { score, label: 'Good',   color: 'bg-yellow-400' }
  return              { score, label: 'Strong', color: 'bg-emerald-500' }
}

export default function PasswordStrength({ password }: Props) {
  if (!password) return null
  const { score, label, color } = getStrength(password)
  const pct = Math.round((score / 6) * 100)

  return (
    <div className="space-y-1">
      <div className="h-1 w-full bg-surface-700 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-300', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-surface-500">
        Password strength: <span className={clsx('font-semibold', {
          'text-red-400': score <= 2,
          'text-amber-400': score === 3,
          'text-yellow-400': score === 4,
          'text-emerald-400': score >= 5,
        })}>{label}</span>
      </p>
    </div>
  )
}
