import { ChevronRight, Home } from 'lucide-react'
import { useNavigationStore } from '../../store/navigationStore'
import { useHierarchyStore } from '../../store/hierarchyStore'
import clsx from 'clsx'

interface Props {
  className?: string
}

export default function Breadcrumb({ className }: Props) {
  const { breadcrumb, popToLevel } = useNavigationStore()
  const { selectPlant, selectShed, selectSection, selectMachine } = useHierarchyStore()

  const handleClick = (idx: number) => {
    const item = breadcrumb[idx]
    popToLevel(item.level)
    // Also sync the hierarchy store when navigating up
    if (item.level === 'plant') {
      selectPlant(item.id)
    } else if (item.level === 'shed') {
      selectShed(item.id)
    } else if (item.level === 'section') {
      selectSection(item.id)
    } else if (item.level === 'machine') {
      selectMachine(item.id)
    }
  }

  if (breadcrumb.length === 0) return null

  return (
    <nav className={clsx('flex items-center gap-1 text-xs', className)}>
      <button
        onClick={() => {
          useNavigationStore.getState().clearBreadcrumb()
        }}
        className="text-surface-500 hover:text-surface-300 transition-colors"
      >
        <Home size={11} />
      </button>
      {breadcrumb.map((item, idx) => (
        <span key={`${item.level}-${item.id}`} className="flex items-center gap-1">
          <ChevronRight size={11} className="text-surface-700" />
          <button
            onClick={() => handleClick(idx)}
            className={clsx(
              'transition-colors',
              idx === breadcrumb.length - 1
                ? 'text-brand-400 font-medium cursor-default'
                : 'text-surface-400 hover:text-surface-200',
            )}
          >
            {item.label}
          </button>
        </span>
      ))}
    </nav>
  )
}
