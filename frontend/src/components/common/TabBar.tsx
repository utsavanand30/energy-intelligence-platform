import clsx from 'clsx'
import type { ReactNode } from 'react'

export interface TabDef {
  key: string
  label: string
  icon?: ReactNode
  badge?: string | number
}

interface Props {
  tabs: TabDef[]
  active: string
  onChange: (key: string) => void
  className?: string
  size?: 'sm' | 'md'
}

export default function TabBar({ tabs, active, onChange, className, size = 'md' }: Props) {
  return (
    <div
      className={clsx(
        'flex items-center gap-0.5 border-b border-surface-800',
        className,
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={clsx(
              'flex items-center gap-1.5 font-medium transition-all border-b-2 -mb-px whitespace-nowrap',
              size === 'sm' ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm',
              isActive
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-surface-500 hover:text-surface-300',
            )}
          >
            {tab.icon && (
              <span className={clsx('shrink-0', isActive ? 'text-brand-400' : 'text-surface-600')}>
                {tab.icon}
              </span>
            )}
            {tab.label}
            {tab.badge !== undefined && (
              <span
                className={clsx(
                  'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                  isActive
                    ? 'bg-brand-600/30 text-brand-300'
                    : 'bg-surface-800 text-surface-500',
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
