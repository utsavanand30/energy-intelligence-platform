/**
 * SLD — Single Line Diagram
 *
 * Renders an interactive one-line electrical diagram of the plant:
 *
 *   Grid Supply (33kV)
 *     └── Main Incoming Breaker
 *           └── Main Bus Bar (415V)
 *                 ├── Conductor PDB-01 → [Bunching, RBD, Stranding, Multiwire]
 *                 ├── Cable PDB        → [Insulation, Armouring, Laying Up, Sheathing]
 *                 └── Utility PDB     → [Others / PDBs]
 *
 * Each energy meter node shows live kW + status colour from the WebSocket store.
 * Clicking a meter node opens the machine detail drawer.
 */
import { useState, useEffect } from 'react'
import TopBar from '../components/layout/TopBar'
import StatusBadge from '../components/common/StatusBadge'
import MachineDrawer from '../components/machines/MachineDrawer'
import { useHierarchy } from '../hooks/useHierarchy'
import { useRealtimeStore } from '../store/realtimeStore'
import { useNavigationStore } from '../store/navigationStore'
import { fetchMeters, fetchMachines } from '../api/hierarchy'
import type { EnergyMeter, Machine } from '../types'
import { fmtKw, fmtPf, fmtVolts } from '../utils/formatters'
import { Zap, Radio, ChevronDown, ChevronRight, Info, Activity } from 'lucide-react'
import clsx from 'clsx'

// ── Colour helpers ──────────────────────────────────────────────────────────
function loadColour(pct: number) {
  if (pct >= 90) return '#ef4444'
  if (pct >= 70) return '#f59e0b'
  return '#22c55e'
}
function statusColour(status: string) {
  switch (status) {
    case 'ONLINE':  return '#22c55e'
    case 'WARNING': return '#f59e0b'
    case 'OFFLINE': return '#ef4444'
    default:        return '#64748b'
  }
}

// ── Types ───────────────────────────────────────────────────────────────────
interface MeterWithMachine {
  meter: EnergyMeter
  machine?: Machine
}

interface SectionGroup {
  sectionName: string
  shedName: string
  items: MeterWithMachine[]
}

// ── Sub-components ──────────────────────────────────────────────────────────

function BusBar({ label, voltage, className }: { label: string; voltage: string; className?: string }) {
  return (
    <div className={clsx('relative flex flex-col items-center', className)}>
      {/* Bus label */}
      <div className="text-[10px] font-semibold text-surface-400 mb-1">{label}</div>
      {/* Thick horizontal bar */}
      <div className="w-full h-3 bg-gradient-to-r from-brand-700 via-brand-500 to-brand-700 rounded-sm shadow-lg shadow-brand-900/50 border border-brand-400/30 flex items-center justify-center">
        <span className="text-[8px] font-bold text-brand-200 tracking-widest">{voltage}</span>
      </div>
    </div>
  )
}

function GridSupply({ totalKw, meterCount }: { totalKw: number; meterCount: number }) {
  return (
    <div className="flex flex-col items-center">
      {/* Grid tower icon */}
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-surface-700 to-surface-800 border border-surface-600 flex items-center justify-center shadow-xl mb-1">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          {/* Pylon */}
          <line x1="16" y1="2"  x2="8"  y2="30" stroke="#94a3b8" strokeWidth="1.5"/>
          <line x1="16" y1="2"  x2="24" y2="30" stroke="#94a3b8" strokeWidth="1.5"/>
          <line x1="6"  y1="12" x2="26" y2="12" stroke="#94a3b8" strokeWidth="1.5"/>
          <line x1="9"  y1="20" x2="23" y2="20" stroke="#94a3b8" strokeWidth="1.5"/>
          {/* Cross arms */}
          <line x1="4"  y1="12" x2="8"  y2="12" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round"/>
          <line x1="24" y1="12" x2="28" y2="12" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round"/>
          <line x1="7"  y1="20" x2="10" y2="20" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round"/>
          <line x1="22" y1="20" x2="25" y2="20" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round"/>
          {/* Insulators dots */}
          <circle cx="4"  cy="12" r="1.5" fill="#fbbf24"/>
          <circle cx="28" cy="12" r="1.5" fill="#fbbf24"/>
          <circle cx="7"  cy="20" r="1.5" fill="#fbbf24"/>
          <circle cx="25" cy="20" r="1.5" fill="#fbbf24"/>
        </svg>
      </div>
      <div className="text-xs font-bold text-surface-200">Grid Supply</div>
      <div className="text-[10px] text-surface-500">33 kV / 415 V</div>
      <div className="mt-1 flex items-center gap-2 text-[10px]">
        <span className="text-emerald-400 font-mono font-bold">{fmtKw(totalKw)}</span>
        <span className="text-surface-600">·</span>
        <span className="text-surface-400">{meterCount} meters</span>
      </div>
    </div>
  )
}

function Breaker({ label, isOpen = false, onClick }: { label: string; isOpen?: boolean; onClick?: () => void }) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center cursor-pointer group',
        onClick && 'hover:opacity-90',
      )}
      onClick={onClick}
    >
      <div className={clsx(
        'w-8 h-5 rounded border-2 flex items-center justify-center transition-colors',
        isOpen ? 'border-emerald-500 bg-emerald-900/40' : 'border-surface-600 bg-surface-800',
      )}>
        <div className={clsx('w-3 h-0.5 rounded-full transition-colors',
          isOpen ? 'bg-emerald-400' : 'bg-surface-500')} />
      </div>
      <span className="text-[8px] text-surface-500 mt-0.5 group-hover:text-surface-300 transition-colors">{label}</span>
    </div>
  )
}

function Wire({ vertical = false, length = 16 }: { vertical?: boolean; length?: number }) {
  return (
    <div
      className="bg-brand-600/60 rounded-full flex-shrink-0"
      style={vertical
        ? { width: 2, height: length }
        : { height: 2, width: length }
      }
    />
  )
}

function MeterNode({
  meter, machine, onClick,
}: {
  meter: EnergyMeter
  machine?: Machine
  onClick?: () => void
}) {
  const readings = useRealtimeStore((s) => s.readings)
  const live = readings[meter.id]
  const kw = live?.active_power_kw ?? 0
  const rated = machine?.rated_power_kw ?? 200
  const pct = Math.min(100, rated > 0 ? (kw / rated) * 100 : 0)
  const colour = live ? loadColour(pct) : statusColour(meter.communication_status)
  const pf = live?.power_factor
  const voltage = live?.voltage_avg

  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all hover:scale-105 active:scale-100 text-left min-w-[100px]"
      style={{
        borderColor: `${colour}40`,
        backgroundColor: `${colour}08`,
        boxShadow: live ? `0 0 12px ${colour}20` : 'none',
      }}
    >
      {/* Meter icon */}
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: `${colour}20`, border: `1px solid ${colour}40` }}
      >
        <Radio size={16} style={{ color: colour }} />
      </div>

      {/* Machine name */}
      <div className="text-[10px] font-semibold text-surface-200 text-center leading-tight max-w-[90px] truncate">
        {machine?.name ?? meter.identification}
      </div>

      {/* Meter ID */}
      <div className="text-[8px] font-mono text-surface-500 truncate max-w-[90px]">
        {meter.identification}
      </div>

      {/* Live values */}
      {live ? (
        <div className="w-full space-y-0.5">
          {/* Load bar */}
          <div className="h-1 w-full bg-surface-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, backgroundColor: colour }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono font-bold" style={{ color: colour }}>
              {kw.toFixed(0)} kW
            </span>
            <span className="text-[8px] text-surface-500">{pct.toFixed(0)}%</span>
          </div>
          {pf && (
            <div className="text-[8px] text-surface-400 font-mono text-center">
              PF {pf.toFixed(2)}
            </div>
          )}
        </div>
      ) : (
        <div className="text-[8px] text-surface-600">No data</div>
      )}
    </button>
  )
}

function SectionPanel({ group, onMeterClick }: {
  group: SectionGroup
  onMeterClick: (machineId: number) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const readings = useRealtimeStore((s) => s.readings)

  const totalKw = group.items.reduce((sum, { meter }) => {
    return sum + (readings[meter.id]?.active_power_kw ?? 0)
  }, 0)
  const onlineCount = group.items.filter(({ meter }) => readings[meter.id]).length

  return (
    <div className="card overflow-hidden">
      {/* Section header bar */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-8 rounded-full bg-brand-500" />
          <div className="text-left">
            <div className="text-sm font-semibold text-surface-100">{group.sectionName}</div>
            <div className="text-[10px] text-surface-500">{group.shedName} · {group.items.length} meters</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-bold font-mono text-brand-400">{fmtKw(totalKw)}</div>
            <div className="text-[9px] text-surface-500">{onlineCount}/{group.items.length} online</div>
          </div>
          {expanded ? <ChevronDown size={14} className="text-surface-500" /> : <ChevronRight size={14} className="text-surface-500" />}
        </div>
      </button>

      {/* Meter nodes grid */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-surface-800">
          {/* Connection line from bus */}
          <div className="flex items-center gap-2 mb-3">
            <div className="h-0.5 w-4 bg-brand-600/50" />
            <div className="flex-1 h-0.5 bg-brand-600/30" />
          </div>

          <div className="flex flex-wrap gap-2">
            {group.items.map(({ meter, machine }) => (
              <MeterNode
                key={meter.id}
                meter={meter}
                machine={machine}
                onClick={() => machine && onMeterClick(machine.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main SLD Page ───────────────────────────────────────────────────────────
export default function SLDPage() {
  const { plants, selectedPlantId } = useHierarchy()
  const { openDrawer } = useNavigationStore()
  const readings = useRealtimeStore((s) => s.readings)

  const [meters, setMeters] = useState<EnergyMeter[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedShed, setSelectedShed] = useState<string | null>(null)

  // Totals
  const totalKw = Object.values(readings).reduce((s, r) => s + (r.active_power_kw ?? 0), 0)
  const onlineMeters = Object.keys(readings).length

  useEffect(() => {
    if (!selectedPlantId) return
    setLoading(true)
    Promise.all([
      fetchMeters({ plant_id: selectedPlantId }),
      fetchMachines({ plant_id: selectedPlantId }),
    ]).then(([ms, machs]) => {
      setMeters(ms)
      setMachines(machs)
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedPlantId])

  // Build section groups
  const machineById = Object.fromEntries(machines.map(m => [m.id, m]))
  const groups: Record<string, SectionGroup> = {}

  for (const meter of meters) {
    if (!meter.enabled) continue
    const machine = meter.machine_id ? machineById[meter.machine_id] : undefined
    const key = `${meter.shed_name}__${meter.section_name}`
    if (!groups[key]) {
      groups[key] = {
        sectionName: meter.section_name ?? 'Unassigned',
        shedName: meter.shed_name ?? '—',
        items: [],
      }
    }
    groups[key].items.push({ meter, machine })
  }

  // Get unique sheds
  const sheds = [...new Set(meters.map(m => m.shed_name).filter(Boolean) as string[])]

  // Filter by selected shed
  const filteredGroups = Object.values(groups).filter(g =>
    selectedShed === null || g.shedName === selectedShed
  )

  // Sort: Conductor first, then Cable, then Others
  const SHED_ORDER = ['Conductor', 'Cable', 'Others']
  filteredGroups.sort((a, b) => {
    const ai = SHED_ORDER.indexOf(a.shedName)
    const bi = SHED_ORDER.indexOf(b.shedName)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Single Line Diagram"
        subtitle="Electrical distribution hierarchy — live status"
      />

      {/* ── Legend + controls bar ──────────────────────────────────── */}
      <div className="px-5 py-3 border-b border-surface-800 bg-surface-950/60 flex flex-wrap items-center gap-4">
        {/* Shed filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-surface-500 font-medium uppercase tracking-wider">Shed:</span>
          <button
            onClick={() => setSelectedShed(null)}
            className={clsx('px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors',
              selectedShed === null ? 'bg-brand-600 text-white' : 'bg-surface-800 text-surface-400 hover:text-surface-200'
            )}
          >
            All
          </button>
          {sheds.map(shed => (
            <button
              key={shed}
              onClick={() => setSelectedShed(shed === selectedShed ? null : shed)}
              className={clsx('px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors',
                selectedShed === shed ? 'bg-brand-600 text-white' : 'bg-surface-800 text-surface-400 hover:text-surface-200'
              )}
            >
              {shed}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 ml-auto text-[9px] text-surface-400 flex-wrap">
          {[
            { colour: '#22c55e', label: 'Normal (<70%)' },
            { colour: '#f59e0b', label: 'High (70–90%)' },
            { colour: '#ef4444', label: 'Critical (>90%)' },
            { colour: '#64748b', label: 'Offline' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: l.colour }} />
              {l.label}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-surface-500">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm">Loading diagram…</p>
            </div>
          </div>
        ) : (
          <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">

            {/* ── TOP: Grid Supply → Main Bus ──────────────────────── */}
            <div className="flex flex-col items-center">
              {/* Grid supply node */}
              <GridSupply totalKw={totalKw} meterCount={onlineMeters} />

              <Wire vertical length={24} />
              <Breaker label="Main Incomer" isOpen={onlineMeters > 0} />
              <Wire vertical length={24} />

              {/* Main 415V bus bar */}
              <BusBar label="MAIN BUS BAR" voltage="415 V" className="w-full max-w-4xl" />
            </div>

            {/* ── Summary KPI strip ─────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total Load',    value: fmtKw(totalKw),          colour: 'text-blue-400' },
                { label: 'Online Meters', value: `${onlineMeters} / ${meters.filter(m=>m.enabled).length}`, colour: 'text-emerald-400' },
                { label: 'Sections',      value: String(Object.keys(groups).length), colour: 'text-purple-400' },
                { label: 'Plant',         value: plants.find(p=>p.id===selectedPlantId)?.name ?? '—', colour: 'text-amber-400' },
              ].map(k => (
                <div key={k.label} className="card px-4 py-3">
                  <div className="text-[9px] text-surface-500 uppercase tracking-wider mb-1">{k.label}</div>
                  <div className={clsx('text-base font-bold font-mono', k.colour)}>{k.value}</div>
                </div>
              ))}
            </div>

            {/* ── SECTION PANELS ──────────────────────────────────────── */}
            {filteredGroups.length === 0 ? (
              <div className="text-center py-12 text-surface-500">
                <Info size={28} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm">No meters found. Wait for the simulator to start sending readings.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Group by shed visually */}
                {SHED_ORDER.filter(shed => selectedShed === null || shed === selectedShed).map(shedName => {
                  const shedGroups = filteredGroups.filter(g => g.shedName === shedName)
                  if (shedGroups.length === 0) return null
                  const shedKw = shedGroups.reduce((s, g) =>
                    s + g.items.reduce((ss, { meter }) => ss + (readings[meter.id]?.active_power_kw ?? 0), 0), 0)

                  return (
                    <div key={shedName}>
                      {/* Shed header */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-px flex-1 bg-surface-800" />
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-800 border border-surface-700">
                          <Activity size={12} className="text-brand-400" />
                          <span className="text-xs font-semibold text-surface-200">{shedName} Shed</span>
                          <span className="text-[10px] font-mono text-brand-400 font-bold">{fmtKw(shedKw)}</span>
                        </div>
                        <div className="h-px flex-1 bg-surface-800" />
                      </div>

                      {/* Distribution line from bus to sections */}
                      <div className="flex flex-col gap-3 pl-4 border-l-2 border-brand-700/40 ml-6">
                        {shedGroups.map(group => (
                          <SectionPanel
                            key={`${group.shedName}-${group.sectionName}`}
                            group={group}
                            onMeterClick={openDrawer}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── Info footer ──────────────────────────────────────────── */}
            <div className="card p-4 flex items-start gap-3 border-brand-800/50">
              <Info size={14} className="text-brand-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-surface-500 leading-relaxed">
                Click any meter node to open the machine detail panel with live electrical parameters and trend charts.
                Colours indicate load percentage: <span className="text-emerald-400">green</span> = normal,{' '}
                <span className="text-amber-400">amber</span> = high load,{' '}
                <span className="text-red-400">red</span> = critical.
                Offline meters appear in grey.
              </p>
            </div>
          </div>
        )}
      </div>

      <MachineDrawer />
    </div>
  )
}
