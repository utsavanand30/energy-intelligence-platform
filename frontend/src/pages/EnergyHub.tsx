import { useState, useEffect } from 'react'
import TopBar from '../components/layout/TopBar'
import HierarchySelector from '../components/common/HierarchySelector'
import TabBar from '../components/common/TabBar'
import PowerGauge from '../components/charts/PowerGauge'
import StatusBadge from '../components/common/StatusBadge'
import LoadingSpinner from '../components/common/LoadingSpinner'
import MachineDrawer from '../components/machines/MachineDrawer'
import { useHierarchyStore } from '../store/hierarchyStore'
import { useNavigationStore } from '../store/navigationStore'
import { useRealtimeStore } from '../store/realtimeStore'
import { fetchMachines } from '../api/hierarchy'
import { fetchMeters } from '../api/energy'
import type { Machine, EnergyMeter } from '../types'
import { fmtKw, fmtPf, fmtVolts, fmtAmps, fmtHz, fmtTimestamp, fmtKwh } from '../utils/formatters'
import { Search, Zap, Radio, LayoutGrid, List, SortAsc } from 'lucide-react'
import clsx from 'clsx'

interface MachineCard { machine: Machine; meter?: EnergyMeter }

const HUB_TABS = [
  { key: 'realtime', label: 'Real-time', icon: <Zap size={13} /> },
  { key: 'table',    label: 'Table View', icon: <List size={13} /> },
]

export default function EnergyHub() {
  const { selectedPlantId, selectedShedId, selectedSectionId } = useHierarchyStore()
  const { hubTab, setHubTab, openDrawer } = useNavigationStore()
  const readings = useRealtimeStore((s) => s.readings)

  const [cards, setCards] = useState<MachineCard[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'kw' | 'pct'>('kw')
  const [viewMode, setViewMode] = useState<'grid' | 'compact'>('grid')

  useEffect(() => {
    if (!selectedPlantId) return
    setLoading(true)
    const params = {
      plant_id: selectedPlantId,
      ...(selectedShedId ? { shed_id: selectedShedId } : {}),
      ...(selectedSectionId ? { section_id: selectedSectionId } : {}),
    }
    Promise.all([
      fetchMachines(params),
      fetchMeters({ plant_id: selectedPlantId, ...(selectedShedId ? { shed_id: selectedShedId } : {}) }),
    ]).then(([machines, meters]) => {
      const meterByMachine = Object.fromEntries(meters.map((m) => [m.machine_id, m]))
      setCards(machines.map((m) => ({ machine: m, meter: meterByMachine[m.id] })))
    }).catch(console.error).finally(() => setLoading(false))
  }, [selectedPlantId, selectedShedId, selectedSectionId])

  // Apply search + sort
  const filtered = cards
    .filter((c) =>
      search === '' ||
      c.machine.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.meter?.identification ?? '').toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const readA = a.meter ? readings[a.meter.id] : undefined
      const readB = b.meter ? readings[b.meter.id] : undefined
      if (sortBy === 'kw') return (readB?.active_power_kw ?? 0) - (readA?.active_power_kw ?? 0)
      if (sortBy === 'pct') {
        const pA = (readA?.active_power_kw ?? 0) / (a.machine.rated_power_kw ?? 400)
        const pB = (readB?.active_power_kw ?? 0) / (b.machine.rated_power_kw ?? 400)
        return pB - pA
      }
      return a.machine.name.localeCompare(b.machine.name)
    })

  // Group by section for table view
  const grouped: Record<string, MachineCard[]> = {}
  for (const c of filtered) {
    const key = c.machine.section_name ?? 'Unassigned'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(c)
  }

  const onlineCount = filtered.filter((c) => c.meter && readings[c.meter.id]).length
  const totalKw = filtered.reduce((s, c) => {
    const r = c.meter ? readings[c.meter.id] : undefined
    return s + (r?.active_power_kw ?? 0)
  }, 0)

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Energy Hub"
        actions={
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-3 text-xs text-surface-400 border-r border-surface-800 pr-3 mr-1">
              <span><span className="text-emerald-400 font-bold">{onlineCount}</span> online</span>
              <span><span className="text-blue-400 font-bold">{totalKw.toFixed(0)}</span> kW total</span>
            </div>
            <div className="flex gap-0.5 border border-surface-700 rounded-lg p-0.5">
              <button onClick={() => setViewMode('grid')}
                className={clsx('p-1 rounded transition-colors', viewMode === 'grid' ? 'bg-surface-700 text-white' : 'text-surface-500 hover:text-surface-300')}>
                <LayoutGrid size={13} />
              </button>
              <button onClick={() => setViewMode('compact')}
                className={clsx('p-1 rounded transition-colors', viewMode === 'compact' ? 'bg-surface-700 text-white' : 'text-surface-500 hover:text-surface-300')}>
                <List size={13} />
              </button>
            </div>
          </div>
        }
      />

      {/* Controls */}
      <div className="px-5 py-2.5 border-b border-surface-800 bg-surface-950/60 flex items-center gap-3 flex-wrap">
        <HierarchySelector showSection compact />
        <div className="relative ml-auto">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
          <input className="input-field pl-8 w-44 text-xs py-1.5" placeholder="Search machine…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-1">
          <SortAsc size={12} className="text-surface-500" />
          {(['name', 'kw', 'pct'] as const).map((s) => (
            <button key={s} onClick={() => setSortBy(s)}
              className={clsx('px-2 py-1 text-[10px] rounded uppercase transition-colors',
                sortBy === s ? 'bg-brand-600 text-white' : 'text-surface-500 hover:text-surface-300 bg-surface-800'
              )}>
              {s === 'pct' ? 'Load%' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-5 bg-surface-950/40">
        <TabBar tabs={HUB_TABS} active={hubTab} onChange={setHubTab} size="sm" />
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner label="Loading machines…" size="lg" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-surface-500">
            <Zap size={32} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">No machines found. Select a shed or section.</p>
          </div>
        ) : (
          <>
            {/* ── REAL-TIME GAUGE CARDS ──────────────────────────── */}
            {hubTab === 'realtime' && (
              viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {filtered.map(({ machine, meter }) => {
                    const reading = meter ? readings[meter.id] : undefined
                    const kw = reading?.active_power_kw ?? 0
                    const maxKw = machine.rated_power_kw ?? 400
                    const status = reading ? 'ONLINE' : (meter?.communication_status ?? 'OFFLINE')
                    return (
                      <div
                        key={machine.id}
                        onClick={() => openDrawer(machine.id)}
                        className="card hover:border-surface-600 transition-all cursor-pointer group relative overflow-hidden"
                      >
                        {/* Subtle top accent by load */}
                        <div className="absolute top-0 left-0 right-0 h-0.5"
                          style={{ backgroundColor: kw > 0 ? (kw / maxKw >= 0.9 ? '#ef4444' : kw / maxKw >= 0.75 ? '#f59e0b' : '#3b82f6') : '#1e293b' }} />

                        <div className="flex items-start justify-between px-3 pt-3 pb-1">
                          <div className="min-w-0 flex-1">
                            <div className="text-[9px] text-surface-600 truncate">{machine.section_name}</div>
                            <div className="text-xs font-semibold text-surface-200 leading-tight truncate group-hover:text-white transition-colors">
                              {machine.name}
                            </div>
                          </div>
                          <StatusBadge status={status} size="sm" />
                        </div>

                        <div className="flex justify-center -mt-1">
                          <PowerGauge currentKw={kw} maxKw={maxKw} size={150} />
                        </div>

                        <div className="grid grid-cols-3 gap-px bg-surface-800 border-t border-surface-800">
                          {[
                            { label: 'V', value: fmtVolts(reading?.voltage_avg), color: 'text-sky-400' },
                            { label: 'A', value: fmtAmps(reading?.current_avg), color: 'text-violet-400' },
                            { label: 'PF', value: fmtPf(reading?.power_factor), color: reading?.power_factor && reading.power_factor < 0.85 ? 'text-amber-400' : 'text-emerald-400' },
                          ].map((p) => (
                            <div key={p.label} className="bg-surface-900 px-1 py-1.5 text-center">
                              <div className={clsx('text-xs font-mono font-medium', p.color)}>{p.value}</div>
                              <div className="text-[8px] text-surface-600">{p.label}</div>
                            </div>
                          ))}
                        </div>

                        {meter && (
                          <div className="px-3 py-1.5 flex items-center justify-between">
                            <div className="flex items-center gap-1 text-[9px] text-surface-600">
                              <Radio size={8} />
                              <span className="font-mono">{meter.identification}</span>
                            </div>
                            <div className="text-[9px] text-surface-600">
                              {reading ? fmtTimestamp(reading.timestamp) : 'No data'}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                // Compact list view grouped by section
                <div className="space-y-4">
                  {Object.entries(grouped).map(([sectionName, sectionCards]) => (
                    <div key={sectionName} className="card overflow-hidden">
                      <div className="card-header">
                        <span className="text-sm font-semibold text-surface-200">{sectionName}</span>
                        <span className="text-xs text-surface-500">{sectionCards.length} machines</span>
                      </div>
                      <div className="divide-y divide-surface-800/50">
                        {sectionCards.map(({ machine, meter }) => {
                          const reading = meter ? readings[meter.id] : undefined
                          const kw = reading?.active_power_kw ?? 0
                          const maxKw = machine.rated_power_kw ?? 400
                          const pct = Math.min(100, (kw / maxKw) * 100)
                          const status = reading ? 'ONLINE' : (meter?.communication_status ?? 'OFFLINE')
                          return (
                            <div
                              key={machine.id}
                              onClick={() => openDrawer(machine.id)}
                              className="flex items-center gap-4 px-4 py-2.5 hover:bg-surface-800/40 cursor-pointer transition-colors"
                            >
                              <div className="w-32 shrink-0">
                                <div className="text-sm font-medium text-surface-200">{machine.name}</div>
                                <div className="text-[10px] font-mono text-surface-500">{meter?.identification}</div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between text-[10px] text-surface-500 mb-1">
                                  <span className="font-mono font-medium text-blue-400">{kw.toFixed(0)} kW</span>
                                  <span>{pct.toFixed(0)}%</span>
                                </div>
                                <div className="h-1.5 bg-surface-800 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all"
                                    style={{ width: `${pct}%`, backgroundColor: pct >= 90 ? '#ef4444' : pct >= 75 ? '#f59e0b' : '#3b82f6' }} />
                                </div>
                              </div>
                              <div className="hidden sm:grid grid-cols-3 gap-3 shrink-0 text-center">
                                {[
                                  { v: fmtVolts(reading?.voltage_avg), c: 'text-sky-400' },
                                  { v: fmtAmps(reading?.current_avg), c: 'text-violet-400' },
                                  { v: fmtPf(reading?.power_factor), c: reading?.power_factor && reading.power_factor < 0.85 ? 'text-amber-400' : 'text-emerald-400' },
                                ].map((p, i) => (
                                  <div key={i} className="text-xs font-mono font-medium">
                                    <div className={p.c}>{p.v}</div>
                                  </div>
                                ))}
                              </div>
                              <div className="shrink-0"><StatusBadge status={status} size="sm" /></div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* ── TABLE VIEW TAB ─────────────────────────────────── */}
            {hubTab === 'table' && (
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-surface-800">
                        {['Machine', 'Meter', 'Section', 'kW', 'kVAr', 'kVA', 'PF', 'V(avg)', 'A(avg)', 'Hz', 'Energy kWh', 'Status', 'Last Seen'].map((h) => (
                          <th key={h} className="text-left text-[10px] text-surface-500 font-semibold uppercase tracking-wider px-3 py-2.5">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(({ machine, meter }) => {
                        const r = meter ? readings[meter.id] : undefined
                        const status = r ? 'ONLINE' : (meter?.communication_status ?? 'OFFLINE')
                        return (
                          <tr
                            key={machine.id}
                            onClick={() => openDrawer(machine.id)}
                            className="border-b border-surface-800/40 hover:bg-surface-800/40 cursor-pointer transition-colors"
                          >
                            <td className="px-3 py-2 text-sm font-medium text-surface-200">{machine.name}</td>
                            <td className="px-3 py-2 text-[10px] font-mono text-surface-400">{meter?.identification ?? '—'}</td>
                            <td className="px-3 py-2 text-xs text-surface-400">{machine.section_name}</td>
                            <td className="px-3 py-2 font-mono text-sm font-bold text-blue-400">{r?.active_power_kw?.toFixed(0) ?? '—'}</td>
                            <td className="px-3 py-2 font-mono text-xs text-orange-400">{r?.reactive_power_kvar?.toFixed(0) ?? '—'}</td>
                            <td className="px-3 py-2 font-mono text-xs text-pink-400">{r?.apparent_power_kva?.toFixed(0) ?? '—'}</td>
                            <td className="px-3 py-2 font-mono text-xs">
                              <span className={clsx(r?.power_factor && r.power_factor >= 0.9 ? 'text-emerald-400' : r?.power_factor && r.power_factor >= 0.85 ? 'text-amber-400' : 'text-red-400')}>
                                {r?.power_factor?.toFixed(3) ?? '—'}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-sky-400">{r?.voltage_avg?.toFixed(0) ?? '—'}</td>
                            <td className="px-3 py-2 font-mono text-xs text-violet-400">{r?.current_avg?.toFixed(0) ?? '—'}</td>
                            <td className="px-3 py-2 font-mono text-xs text-teal-400">{r?.frequency?.toFixed(2) ?? '—'}</td>
                            <td className="px-3 py-2 font-mono text-xs text-surface-300">{r?.active_energy_kwh ? fmtKwh(r.active_energy_kwh) : '—'}</td>
                            <td className="px-3 py-2"><StatusBadge status={status} size="sm" /></td>
                            <td className="px-3 py-2 text-[10px] font-mono text-surface-500">{r ? fmtTimestamp(r.timestamp) : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <MachineDrawer />
    </div>
  )
}
