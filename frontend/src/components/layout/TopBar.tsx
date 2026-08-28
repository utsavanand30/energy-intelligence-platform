import { useRealtimeStore } from '../../store/realtimeStore'
import { useNavigationStore } from '../../store/navigationStore'
import Breadcrumb from '../common/Breadcrumb'
import { fmtTimestamp } from '../../utils/formatters'
import { Wifi, WifiOff, RefreshCw, Bell } from 'lucide-react'
import clsx from 'clsx'
import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  actions?: ReactNode
}

export default function TopBar({ title, subtitle, actions }: Props) {
  const { connected, lastUpdate, readings } = useRealtimeStore()
  const readingCount = Object.keys(readings).length
  const { breadcrumb } = useNavigationStore()

  return (
    <header className="border-b border-surface-800 bg-surface-900/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="flex items-center px-5 h-12 gap-3">
        {/* Title + breadcrumb */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-white whitespace-nowrap">{title}</h1>
            {breadcrumb.length > 0 && (
              <Breadcrumb className="hidden sm:flex" />
            )}
          </div>
          {subtitle && !breadcrumb.length && (
            <p className="text-[10px] text-surface-500 mt-0.5">{subtitle}</p>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0">
          {actions}

          {/* Live feed indicator */}
          {readingCount > 0 && (
            <div className="hidden sm:flex items-center gap-1 text-[10px] text-surface-500">
              <RefreshCw
                size={10}
                className="text-brand-500"
                style={{ animation: 'spin 4s linear infinite' }}
              />
              <span>{fmtTimestamp(lastUpdate)}</span>
            </div>
          )}

          {/* Alerts bell (placeholder) */}
          <button className="relative w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-800 transition-colors">
            <Bell size={14} className="text-surface-400" />
            <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-amber-500 rounded-full border border-surface-900" />
          </button>

          {/* Connection status */}
          <div
            className={clsx(
              'flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full',
              connected
                ? 'bg-energy-green/10 text-energy-green'
                : 'bg-energy-red/10 text-energy-red',
            )}
          >
            {connected ? <Wifi size={10} /> : <WifiOff size={10} />}
            <span className="hidden sm:inline">
              {connected ? `${readingCount}m` : 'Offline'}
            </span>
          </div>

          {/* Avatar */}
          <div className="w-6 h-6 rounded-full bg-brand-700 flex items-center justify-center text-[9px] font-bold text-white select-none">
            SA
          </div>
        </div>
      </div>
    </header>
  )
}
