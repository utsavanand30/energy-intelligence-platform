import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Zap, Activity, BarChart3,
  Settings, FileText, AlertTriangle, TrendingUp,
  ChevronRight, ChevronDown, Building2, Factory,
  Layers, Cpu, GitBranch, X,
} from 'lucide-react'
import clsx from 'clsx'
import { useState } from 'react'
import { useHierarchyStore } from '../../store/hierarchyStore'
import { useHierarchy } from '../../hooks/useHierarchy'
import { useNavigationStore } from '../../store/navigationStore'

const NAV_ITEMS = [
  { label: 'Energy Overview', path: '/',            icon: LayoutDashboard, end: true },
  { label: 'Energy Hub',      path: '/energy-hub',  icon: Zap },
  { label: 'Live Metrics',    path: '/live-metrics', icon: Activity },
  { label: 'Analytics',       path: '/analytics',   icon: TrendingUp },
  { label: 'SLD Diagram',     path: '/sld',         icon: GitBranch },
  { label: 'Reports',         path: '/reports',     icon: FileText },
  { label: 'Configuration',   path: '/configuration', icon: Settings },
  { label: 'Meter Health',    path: '/meter-health', icon: AlertTriangle },
]

function NavItem({ item, onClose }: { item: typeof NAV_ITEMS[0]; onClose?: () => void }) {
  return (
    <NavLink
      to={item.path}
      end={item.end}
      onClick={onClose}
      className={({ isActive }) =>
        clsx(
          'group flex items-center gap-2.5 px-3 py-2 rounded-lg mb-0.5 text-sm transition-all',
          isActive
            ? 'bg-brand-600/20 text-brand-300 border border-brand-600/25'
            : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800',
        )
      }
    >
      {({ isActive }) => (
        <>
          <item.icon
            size={15}
            className={clsx('shrink-0', isActive ? 'text-brand-400' : 'text-surface-600 group-hover:text-surface-400')}
          />
          <span className={clsx('font-medium text-sm', isActive && 'text-brand-300')}>
            {item.label}
          </span>
          {isActive && <ChevronRight size={11} className="ml-auto text-brand-600" />}
        </>
      )}
    </NavLink>
  )
}

// Layered drill-down explorer inside the sidebar
function HierarchyExplorer() {
  // Initialise the cascade hook so plants load on mount
  const store = useHierarchy()
  const {
    plants, sheds, sections, machines,
    selectedPlantId, selectedShedId, selectedSectionId, selectedMachineId,
    loadingSheds, loadingSections, loadingMachines,
    selectPlant, selectShed, selectSection, selectMachine,
  } = store
  const { pushBreadcrumb } = useNavigationStore()

  const [open, setOpen] = useState(true)

  const pick = <T extends { id: number; name: string }>(
    items: T[],
    selectedId: number | null,
    onSelect: (id: number | null) => void,
    level: 'plant' | 'shed' | 'section' | 'machine',
    icon: React.ReactNode,
    loading?: boolean,
  ) => (
    <div className="space-y-0.5">
      {loading && (
        <div className="px-3 py-1 text-[10px] text-surface-600 animate-pulse">Loading…</div>
      )}
      {items.map((item) => {
        const isActive = selectedId === item.id
        return (
          <button
            key={item.id}
            onClick={() => {
              if (isActive) {
                onSelect(null)
              } else {
                onSelect(item.id)
                pushBreadcrumb({ level, id: item.id, label: item.name })
              }
            }}
            className={clsx(
              'w-full flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-all text-left',
              isActive
                ? 'bg-brand-700/30 text-brand-300 border border-brand-700/40'
                : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800',
            )}
          >
            <span className={clsx('shrink-0', isActive ? 'text-brand-400' : 'text-surface-600')}>
              {icon}
            </span>
            <span className="truncate font-medium">{item.name}</span>
            {isActive && <ChevronDown size={9} className="ml-auto text-brand-500" />}
          </button>
        )
      })}
    </div>
  )

  const indent = 'pl-3 border-l border-surface-800 ml-3'

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-surface-500 uppercase tracking-widest font-semibold hover:text-surface-300 transition-colors"
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        Plant Explorer
      </button>

      {open && (
        <div className="mt-1 space-y-0.5">
          {/* Plants */}
          {pick(plants, selectedPlantId, selectPlant, 'plant', <Building2 size={11} />)}

          {/* Sheds */}
          {selectedPlantId && (
            <div className={indent}>
              {pick(sheds, selectedShedId, selectShed, 'shed', <Factory size={11} />, loadingSheds)}

              {/* Sections — skip display if the only section shares the shed's name */}
              {selectedShedId && (() => {
                const selectedShedObj = sheds.find(s => s.id === selectedShedId)
                const isSingleSameName =
                  sections.length === 1 && sections[0].name === selectedShedObj?.name
                // For single-section sheds with same name, show machines directly
                if (isSingleSameName && sections[0]) {
                  // Auto-select it silently so machines cascade
                  if (!selectedSectionId) {
                    selectSection(sections[0].id)
                  }
                  return (
                    <div className={indent}>
                      {pick(machines, selectedMachineId, selectMachine, 'machine', <Cpu size={11} />, loadingMachines)}
                    </div>
                  )
                }
                return (
                  <div className={indent}>
                    {pick(sections, selectedSectionId, selectSection, 'section', <Layers size={11} />, loadingSections)}
                    {selectedSectionId && (
                      <div className={indent}>
                        {pick(machines, selectedMachineId, selectMachine, 'machine', <Cpu size={11} />, loadingMachines)}
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface SidebarProps {
  onClose?: () => void
}

export default function Sidebar({ onClose }: SidebarProps) {
  return (
    <aside className="w-56 shrink-0 bg-surface-900 border-r border-surface-800 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-4 py-3.5 border-b border-surface-800">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white leading-tight tracking-tight">EnergyIQ</div>
            <div className="text-[9px] text-surface-500 leading-tight">Cable Plant Monitor</div>
          </div>
          {/* Close button — only shown in mobile drawer */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-surface-800 text-surface-500 hover:text-surface-300 transition-colors shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Main nav */}
      <nav className="px-2 pt-3">
        <div className="text-[9px] font-bold text-surface-600 uppercase tracking-widest px-3 mb-1.5">
          Navigation
        </div>
        {NAV_ITEMS.map((item) => <NavItem key={item.path} item={item} onClose={onClose} />)}
      </nav>

      {/* Plant Explorer drill-down */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <HierarchyExplorer />
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-surface-800 space-y-0.5">
        <div className="text-[9px] text-surface-600 font-medium">
          Phase 1 · Simulation Active
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-energy-green animate-pulse" />
          <span className="text-[9px] text-surface-500">Live data streaming</span>
        </div>
      </div>
    </aside>
  )
}
