import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Zap, Activity, TrendingUp, FileText } from 'lucide-react'
import clsx from 'clsx'

const MOBILE_NAV = [
  { label: 'Overview',  path: '/',            icon: LayoutDashboard, end: true },
  { label: 'Hub',       path: '/energy-hub',  icon: Zap },
  { label: 'Metrics',   path: '/live-metrics',icon: Activity },
  { label: 'Analytics', path: '/analytics',   icon: TrendingUp },
  { label: 'Reports',   path: '/reports',     icon: FileText },
]

export default function MobileNav() {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface-900 border-t border-surface-800 flex items-stretch safe-bottom">
      {MOBILE_NAV.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.end}
          className={({ isActive }) =>
            clsx(
              'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[9px] font-medium transition-colors',
              isActive ? 'text-brand-400' : 'text-surface-500',
            )
          }
        >
          {({ isActive }) => (
            <>
              <item.icon
                size={18}
                className={clsx(isActive ? 'text-brand-400' : 'text-surface-600')}
              />
              {item.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
