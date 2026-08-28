import { useState, useEffect } from 'react'
import TopBar from '../components/layout/TopBar'
import StatusBadge from '../components/common/StatusBadge'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { fetchMeterHealth } from '../api/energy'
import { fetchPlants } from '../api/hierarchy'
import type { MeterHealth, Plant } from '../types'
import { fmtDatetime } from '../utils/formatters'
import { RefreshCw, CheckCircle, AlertTriangle, XCircle, MinusCircle } from 'lucide-react'

export default function MeterHealthPage() {
  const [plants, setPlants] = useState<Plant[]>([])
  const [plantId, setPlantId] = useState<number | null>(null)
  const [meters, setMeters] = useState<MeterHealth[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchPlants().then((ps) => {
      setPlants(ps)
      if (ps.length > 0) setPlantId(ps[0].id)
    })
  }, [])

  useEffect(() => {
    if (!plantId) return
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [plantId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    if (!plantId) return
    setLoading(true)
    try {
      const data = await fetchMeterHealth({ plant_id: plantId })
      setMeters(data)
    } finally {
      setLoading(false)
    }
  }

  const online = meters.filter((m) => m.communication_status === 'ONLINE').length
  const warning = meters.filter((m) => m.communication_status === 'WARNING').length
  const offline = meters.filter((m) => m.communication_status === 'OFFLINE').length
  const disabled = meters.filter((m) => m.communication_status === 'DISABLED').length

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Meter Health" subtitle="Communication status for all energy meters" />

      <div className="px-6 py-3 border-b border-surface-800 bg-surface-900/40 flex items-center gap-4 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-surface-500 uppercase tracking-wider font-medium px-0.5">Plant</label>
          <select className="select-field" value={plantId ?? ''} onChange={(e) => setPlantId(Number(e.target.value))}>
            {plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <button onClick={load} className="btn-secondary text-xs gap-1.5 mt-4">
          <RefreshCw size={13} />Refresh
        </button>
      </div>

      <div className="flex-1 p-6 space-y-6">
        {/* Summary tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Online', count: online, icon: <CheckCircle size={18} />, cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
            { label: 'Warning', count: warning, icon: <AlertTriangle size={18} />, cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
            { label: 'Offline', count: offline, icon: <XCircle size={18} />, cls: 'text-red-400 bg-red-500/10 border-red-500/20' },
            { label: 'Disabled', count: disabled, icon: <MinusCircle size={18} />, cls: 'text-surface-400 bg-surface-700/30 border-surface-700/30' },
          ].map((t) => (
            <div key={t.label} className={`card border p-4 flex items-center gap-3 ${t.cls}`}>
              {t.icon}
              <div>
                <div className="text-2xl font-bold">{t.count}</div>
                <div className="text-xs opacity-75">{t.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Meter table */}
        {loading && meters.length === 0 ? (
          <div className="flex justify-center py-12"><LoadingSpinner label="Loading…" /></div>
        ) : (
          <div className="card overflow-hidden">
            <div className="card-header">
              <span className="text-sm font-medium text-surface-200">All Meters — {meters.length} total</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-800">
                    {['Meter ID', 'Machine', 'Section', 'Make / Model', 'Protocol', 'Last Seen', 'Status', 'Last Error'].map((h) => (
                      <th key={h} className="text-left text-xs text-surface-500 font-medium px-4 py-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {meters.map((m) => (
                    <tr key={m.id} className="border-b border-surface-800/50 hover:bg-surface-800/30 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs text-surface-300">{m.identification}</td>
                      <td className="px-4 py-2.5 text-xs text-surface-200">{m.machine_name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-surface-400">{m.section_name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-surface-400">{m.make} {m.model}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10px] font-mono bg-surface-800 text-surface-400 px-1.5 py-0.5 rounded">
                          {m.communication_protocol}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-surface-400 font-mono">
                        {fmtDatetime(m.last_seen)}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={m.enabled ? m.communication_status : 'DISABLED'} size="sm" />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-red-400/70 truncate max-w-[200px]">
                        {m.last_error ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
