import type { MeterStatus } from '../../types'
import clsx from 'clsx'

interface Props {
  status: MeterStatus | string
  size?: 'sm' | 'md'
}

const MAP: Record<string, { cls: string; dot: string; label: string }> = {
  ONLINE:   { cls: 'badge-online',   dot: 'bg-energy-green',  label: 'Online'   },
  WARNING:  { cls: 'badge-warning',  dot: 'bg-energy-amber',  label: 'Warning'  },
  OFFLINE:  { cls: 'badge-offline',  dot: 'bg-energy-red',    label: 'Offline'  },
  DISABLED: { cls: 'badge-disabled', dot: 'bg-surface-500',   label: 'Disabled' },
  IDLE:     { cls: 'badge-disabled', dot: 'bg-surface-500',   label: 'Idle'     },
}

export default function StatusBadge({ status, size = 'md' }: Props) {
  const m = MAP[status] ?? MAP['OFFLINE']
  return (
    <span className={clsx(m.cls, size === 'sm' && 'text-[10px] px-1.5')}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', m.dot)} />
      {m.label}
    </span>
  )
}
