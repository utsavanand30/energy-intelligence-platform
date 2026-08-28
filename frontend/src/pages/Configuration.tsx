import { useState, useEffect } from 'react'
import TopBar from '../components/layout/TopBar'
import StatusBadge from '../components/common/StatusBadge'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { fetchPlants } from '../api/hierarchy'
import { fetchMeters } from '../api/energy'
import type { Plant, EnergyMeter } from '../types'
import { Settings, Search, ChevronRight, Radio } from 'lucide-react'

interface GroupedSection {
  shed_name: string
  section_name: string
  meters: EnergyMeter[]
}

export default function Configuration() {
  const [plants, setPlants] = useState<Plant[]>([])
  const [selectedPlantId, setSelectedPlantId] = useState<number | null>(null)
  const [meters, setMeters] = useState<EnergyMeter[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchPlants().then((ps) => {
      setPlants(ps)
      if (ps.length > 0) setSelectedPlantId(ps[0].id)
    })
  }, [])

  useEffect(() => {
    if (!selectedPlantId) return
    setLoading(true)
    fetchMeters({ plant_id: selectedPlantId })
      .then(setMeters)
      .finally(() => setLoading(false))
  }, [selectedPlantId])

  // Group by shed → section
  const grouped: Record<string, GroupedSection> = {}
  const filtered = meters.filter((m) =>
    search === '' ||
    m.identification.toLowerCase().includes(search.toLowerCase()) ||
    m.machine_name?.toLowerCase().includes(search.toLowerCase()) ||
    m.section_name?.toLowerCase().includes(search.toLowerCase())
  )
  for (const m of filtered) {
    const key = `${m.shed_name}__${m.section_name}`
    if (!grouped[key]) {
      grouped[key] = { shed_name: m.shed_name ?? '—', section_name: m.section_name ?? '—', meters: [] }
    }
    grouped[key].meters.push(m)
  }

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Section & Meter Configuration" subtitle="Hierarchy master data and meter assignments" />

      {/* Controls */}
      <div className="px-6 py-3 border-b border-surface-800 bg-surface-900/40 flex items-center gap-4 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-surface-500 uppercase tracking-wider font-medium px-0.5">Plant</label>
          <select
            className="select-field min-w-[160px]"
            value={selectedPlantId ?? ''}
            onChange={(e) => setSelectedPlantId(Number(e.target.value))}
          >
            {plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500" />
          <input
            className="input-field pl-8 w-52"
            placeholder="Search meter / machine…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 p-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <LoadingSpinner label="Loading meters…" size="lg" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-center gap-4 text-sm text-surface-400">
              <span><strong className="text-surface-200">{meters.length}</strong> total meters</span>
              <span><strong className="text-emerald-400">{meters.filter(m => m.communication_status === 'ONLINE').length}</strong> online</span>
              <span><strong className="text-amber-400">{meters.filter(m => m.communication_status === 'WARNING').length}</strong> warning</span>
              <span><strong className="text-red-400">{meters.filter(m => m.communication_status === 'OFFLINE').length}</strong> offline</span>
            </div>

            {/* Grouped table */}
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-800">
                    {['Shed', 'Section', 'Machine', 'Meter ID', 'Make / Model', 'Protocol', 'Status'].map((h) => (
                      <th key={h} className="text-left text-xs text-surface-500 font-medium px-4 py-2.5">{h}</th>
                    ))}
                    <th className="px-4 py-2.5 text-xs text-surface-500 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(grouped).length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-surface-500 text-xs">
                        No meters found
                      </td>
                    </tr>
                  ) : (
                    Object.values(grouped).map((group) =>
                      group.meters.map((meter, idx) => (
                        <tr key={meter.id} className="border-b border-surface-800/50 hover:bg-surface-800/30 transition-colors">
                          <td className="px-4 py-2.5 text-surface-400 text-xs">
                            {idx === 0 ? group.shed_name : ''}
                          </td>
                          <td className="px-4 py-2.5">
                            {idx === 0 ? (
                              <span className="text-brand-400 font-medium text-xs">{group.section_name}</span>
                            ) : ''}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-surface-200 text-xs">{meter.machine_name ?? '—'}</div>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <Radio size={10} className="text-surface-500" />
                              <span className="font-mono text-xs text-surface-300">{meter.identification}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-surface-400">
                            {meter.make} {meter.model}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="text-xs bg-surface-800 text-surface-400 px-2 py-0.5 rounded font-mono">
                              {meter.communication_protocol}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusBadge status={meter.enabled ? meter.communication_status : 'DISABLED'} size="sm" />
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button className="text-surface-500 hover:text-brand-400 transition-colors">
                              <Settings size={13} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
