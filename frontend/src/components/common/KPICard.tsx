import clsx from 'clsx'
import type { ReactNode } from 'react'

interface Props {
  label: string
  value: string | ReactNode
  sub?: string
  icon?: ReactNode
  trend?: { value: number; label: string }
  accent?: 'blue' | 'green' | 'amber' | 'red' | 'purple'
  className?: string
}

const ACCENT_MAP = {
  blue:   { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/20' },
  green:  { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  amber:  { bg: 'bg-amber-500/10',  text: 'text-amber-400',  border: 'border-amber-500/20' },
  red:    { bg: 'bg-red-500/10',    text: 'text-red-400',    border: 'border-red-500/20' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
}

export default function KPICard({ label, value, sub, icon, trend, accent = 'blue', className }: Props) {
  const a = ACCENT_MAP[accent]

  return (
    <div className={clsx('card p-4 flex flex-col gap-1', className)}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-surface-400 font-medium leading-tight">{label}</span>
        {icon && (
          <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', a.bg)}>
            <span className={clsx('text-sm', a.text)}>{icon}</span>
          </div>
        )}
      </div>
      <div className={clsx('text-xl font-bold tabular-nums leading-tight', a.text)}>
        {value}
      </div>
      <div className="flex items-center gap-2 min-h-4">
        {sub && <span className="text-xs text-surface-500">{sub}</span>}
        {trend && (
          <span
            className={clsx(
              'text-xs font-medium',
              trend.value > 0 ? 'text-energy-red' : 'text-energy-green',
            )}
          >
            {trend.label}
          </span>
        )}
      </div>
    </div>
  )
}
