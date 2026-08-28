import { useState, useEffect, useCallback } from 'react'
import TopBar from '../components/layout/TopBar'
import HierarchySelector from '../components/common/HierarchySelector'
import TabBar from '../components/common/TabBar'
import ElectricalChart from '../components/charts/ElectricalChart'
import { useHierarchy } from '../hooks/useHierarchy'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { useHierarchyStore } from '../store/hierarchyStore'
import { useNavigationStore } from '../store/navigationStore'
import { fetchMetricsSummary, fetchMetricsReadings, fetchMeters } from '../api/energy'
import type { MetricsSummary, MeterReading, EnergyMeter } from '../types'
import { fmtKwh, fmtKw, fmtPf, fmtVolts, fmtAmps } from '../utils/formatters'
import { RefreshCw, Activity } from 'lucide-react'
import clsx from 'clsx'

const METRICS_TABS = [
  { key: 'electrical', label: 'Electrical' },
  { key: 'power', label: 'Power' },
  { key: 'phase', label: 'Phase Detail' },
]

const RESOLUTIONS = [
  { label: 'Raw (30s)', value: 'raw' },
  { label: '5 min', value: '5min' },
  { label: '15 min', value: '15min' },
  { label: '30 min', value: '30min' },
  { label: 'Hourly', value: 'hourly' },
]

export default function LiveMetrics() {
  const { selectedPlantId, selectedShedId, selectedSectionId } = useHierarchyStore()
  const { metricsTab, setMetricsTab } = useNavigationStore()
  // Initialise cascade hook so plant auto-select fires even on direct navigation
  useHierarchy()

  const [meters, setMeters] = useState<EnergyMeter[]>([])
  const [selectedMeterId, setSelectedMeterId] = useState<number | null>(null)
  const [summary, setSummary] = useState<MetricsSummary | null>(null)
  const [readings, setReadings] = useState<MeterReading[]>([])
  const [granularity, setGranularity] = useState('raw')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedPlantId) return
    fetchMeters({
      plant_id: selectedPlantId,
      ...(selectedShedId ? { shed_id: selectedShedId } : {}),
      ...(selectedSectionId ? { section_id: selectedSectionId } : {}),
    }).then((ms) => {
      setMeters(ms)
      if (ms.length > 0) setSelectedMeterId(ms[0].id)
    })
  }, [selectedPlantId, selectedShedId, selectedSectionId])

  const load = useCallback(async () => {
    if (!selectedMeterId) return
    setLoading(true)
    try {
      const [s, r] = await Promise.all([
        fetchMetricsSummary({ meter_id: selectedMeterId }),
        fetchMetricsReadings({ meter_id: selectedMeterId, granularity, limit: 360 }),
      ])
      setSummary(s)
      setReadings([...r].reverse())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [selectedMeterId, granularity])

  useEffect(() => {
    if (selectedMeterId) load()
  }, [selectedMeterId, granularity]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedMeter = meters.find((m) => m.id === selectedMeterId)

  const SUMMARY_ITEMS = [
    { label: 'Total Consumption', value: fmtKwh(summary?.total_kwh), cls: 'text-brand-400' },
    { label: 'Average Power', value: fmtKw(summary?.avg_power_kw), cls: 'text-blue-400' },
    { label: 'Average PF', value: fmtPf(summary?.avg_pf), cls: summary?.avg_pf && summary.avg_pf < 0.9 ? 'text-amber-400' : 'text-emerald-400' },
    { label: 'Maximum Demand', value: fmtKw(summary?.max_demand_kw), cls: 'text-orange-400' },
    { label: 'Average Voltage', value: fmtVolts(summary?.avg_voltage), cls: 'text-sky-400' },
    { label: 'Average Current', value: fmtAmps(summary?.avg_current), cls: 'text-violet-400' },
  ]

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Live Metrics"
        actions={
          <button onClick={load} className="btn-secondary text-xs gap-1.5 py-1.5">
            <RefreshCw size={12} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        }
      />

      {/* Controls */}
      <div className="px-5 py-2.5 border-b border-surface-800 bg-surface-950/60 flex items-center gap-3 flex-wrap">
        <HierarchySelector showSection compact />

        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] text-surface-500 uppercase tracking-wider font-medium">Meter / Machine</label>
          <select className="select-field min-w-[180px] text-xs py-1.5"
            value={selectedMeterId ?? ''}
            onChange={(e) => setSelectedMeterId(e.target.value ? Number(e.target.value) : null)}>
            {meters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.machine_name ?? m.identification} ({m.identification})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-0.5">
          <label className="text-[9px] text-surface-500 uppercase tracking-wider font-medium">Resolution</label>
          <div className="flex gap-1">
            {RESOLUTIONS.map((r) => (
              <button key={r.value} onClick={() => setGranularity(r.value)}
                className={clsx('px-2 py-1.5 text-[10px] rounded transition-colors',
                  r.value === granularity ? 'bg-brand-600 text-white' : 'bg-surface-800 text-surface-400 hover:text-surface-200 border border-surface-700'
                )}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex items-stretch border-b border-surface-800 bg-surface-950/30 divide-x divide-surface-800 overflow-x-auto shrink-0">
        {SUMMARY_ITEMS.map((s) => (
          <div key={s.label} className="flex flex-col px-5 py-2.5 min-w-[120px]">
            <div className="text-[9px] text-surface-500 uppercase tracking-wider font-medium mb-0.5">{s.label}</div>
            <div className={clsx('text-base font-bold font-mono tabular-nums', s.cls)}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="px-5 bg-surface-950/40">
        <TabBar tabs={METRICS_TABS} active={metricsTab} onChange={setMetricsTab} size="sm" />
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-16"><LoadingSpinner label="Loading readings…" /></div>
        ) : readings.length === 0 ? (
          <div className="text-center py-16">
            <Activity size={32} className="mx-auto mb-3 text-surface-600" />
            <p className="text-sm text-surface-500">No readings yet — simulator generates data every 30 seconds</p>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* ELECTRICAL TAB */}
            {metricsTab === 'electrical' && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="card">
                    <div className="card-header"><span className="text-sm font-semibold text-surface-200">Active Power (kW)</span></div>
                    <div className="p-3">
                      <ElectricalChart readings={readings} height={170}
                        series={[{ field: 'active_power_kw', label: 'kW', color: '#3b82f6', unit: 'kW' }]} />
                    </div>
                  </div>
                  <div className="card">
                    <div className="card-header"><span className="text-sm font-semibold text-surface-200">Power Factor</span></div>
                    <div className="p-3">
                      <ElectricalChart readings={readings} height={170}
                        series={[{ field: 'power_factor', label: 'PF', color: '#22c55e', unit: '' }]} />
                    </div>
                  </div>
                  <div className="card">
                    <div className="card-header"><span className="text-sm font-semibold text-surface-200">Frequency (Hz)</span></div>
                    <div className="p-3">
                      <ElectricalChart readings={readings} height={160}
                        series={[{ field: 'frequency', label: 'Hz', color: '#06b6d4', unit: 'Hz' }]} />
                    </div>
                  </div>
                  <div className="card">
                    <div className="card-header"><span className="text-sm font-semibold text-surface-200">Reactive & Apparent Power</span></div>
                    <div className="p-3">
                      <ElectricalChart readings={readings} height={160}
                        series={[
                          { field: 'reactive_power_kvar', label: 'kVAr', color: '#f59e0b', unit: 'kVAr' },
                          { field: 'apparent_power_kva', label: 'kVA', color: '#8b5cf6', unit: 'kVA' },
                        ]} />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* POWER TAB */}
            {metricsTab === 'power' && (
              <div className="space-y-4">
                <div className="card">
                  <div className="card-header"><span className="text-sm font-semibold text-surface-200">Active Power kW</span></div>
                  <div className="p-3">
                    <ElectricalChart readings={readings} height={200}
                      series={[{ field: 'active_power_kw', label: 'Active kW', color: '#3b82f6', unit: 'kW' }]} />
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="card">
                    <div className="card-header"><span className="text-sm font-semibold text-surface-200">Reactive Power kVAr</span></div>
                    <div className="p-3">
                      <ElectricalChart readings={readings} height={170}
                        series={[{ field: 'reactive_power_kvar', label: 'kVAr', color: '#f59e0b', unit: 'kVAr' }]} />
                    </div>
                  </div>
                  <div className="card">
                    <div className="card-header"><span className="text-sm font-semibold text-surface-200">Apparent Power kVA</span></div>
                    <div className="p-3">
                      <ElectricalChart readings={readings} height={170}
                        series={[{ field: 'apparent_power_kva', label: 'kVA', color: '#8b5cf6', unit: 'kVA' }]} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PHASE DETAIL TAB */}
            {metricsTab === 'phase' && (
              <div className="space-y-4">
                <div className="card">
                  <div className="card-header"><span className="text-sm font-semibold text-surface-200">Phase Voltage L-N</span></div>
                  <div className="p-3">
                    <ElectricalChart readings={readings} height={180}
                      series={[
                        { field: 'voltage_r', label: 'R-N', color: '#ef4444', unit: 'V' },
                        { field: 'voltage_y', label: 'Y-N', color: '#eab308', unit: 'V' },
                        { field: 'voltage_b', label: 'B-N', color: '#60a5fa', unit: 'V' },
                      ]} />
                  </div>
                </div>
                <div className="card">
                  <div className="card-header"><span className="text-sm font-semibold text-surface-200">Line Voltage L-L</span></div>
                  <div className="p-3">
                    <ElectricalChart readings={readings} height={180}
                      series={[
                        { field: 'voltage_ry', label: 'R-Y', color: '#ef4444', unit: 'V' },
                        { field: 'voltage_yb', label: 'Y-B', color: '#eab308', unit: 'V' },
                        { field: 'voltage_br', label: 'B-R', color: '#60a5fa', unit: 'V' },
                      ]} />
                  </div>
                </div>
                <div className="card">
                  <div className="card-header"><span className="text-sm font-semibold text-surface-200">Phase Current</span></div>
                  <div className="p-3">
                    <ElectricalChart readings={readings} height={180}
                      series={[
                        { field: 'current_r', label: 'IR', color: '#ef4444', unit: 'A' },
                        { field: 'current_y', label: 'IY', color: '#eab308', unit: 'A' },
                        { field: 'current_b', label: 'IB', color: '#60a5fa', unit: 'A' },
                      ]} />
                  </div>
                </div>

                {/* Phase summary table */}
                <div className="card overflow-hidden">
                  <div className="card-header">
                    <span className="text-sm font-semibold text-surface-200">Latest Phase Values</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-surface-800">
                          {['Phase', 'Voltage L-N (V)', 'Voltage L-L (V)', 'Current (A)'].map((h) => (
                            <th key={h} className="text-left text-[10px] text-surface-500 font-semibold px-4 py-2.5">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {readings.slice(-1).map((r) => (
                          [
                            { phase: 'R', vln: r.voltage_r, vll: r.voltage_ry, i: r.current_r },
                            { phase: 'Y', vln: r.voltage_y, vll: r.voltage_yb, i: r.current_y },
                            { phase: 'B', vln: r.voltage_b, vll: r.voltage_br, i: r.current_b },
                          ].map((p) => (
                            <tr key={p.phase} className="border-b border-surface-800/40">
                              <td className="px-4 py-2.5 font-bold text-sm" style={{
                                color: p.phase === 'R' ? '#ef4444' : p.phase === 'Y' ? '#eab308' : '#60a5fa'
                              }}>{p.phase}</td>
                              <td className="px-4 py-2.5 font-mono text-sm text-sky-400">{p.vln?.toFixed(1) ?? '—'}</td>
                              <td className="px-4 py-2.5 font-mono text-sm text-teal-400">{p.vll?.toFixed(1) ?? '—'}</td>
                              <td className="px-4 py-2.5 font-mono text-sm text-violet-400">{p.i?.toFixed(1) ?? '—'}</td>
                            </tr>
                          ))
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
