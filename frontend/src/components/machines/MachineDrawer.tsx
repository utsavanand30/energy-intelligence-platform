/**
 * Machine Detail Drawer — slides in from the right when any machine is clicked.
 * Shows live electrical parameters + mini trend charts + drill-down to Live Metrics.
 */
import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, ExternalLink, Radio, Zap, TrendingUp, Activity, Gauge } from 'lucide-react'
import clsx from 'clsx'
import { useNavigationStore } from '../../store/navigationStore'
import { useRealtimeStore } from '../../store/realtimeStore'
import { fetchMeters, fetchMetricsReadings, fetchMetricsSummary } from '../../api/energy'
import type { EnergyMeter, MeterReading, MetricsSummary } from '../../types'
import ElectricalChart from '../charts/ElectricalChart'
import StatusBadge from '../common/StatusBadge'
import { fmtKw, fmtVolts, fmtAmps, fmtPf, fmtHz, fmtKwh, fmtTimestamp } from '../../utils/formatters'
import { useHierarchyStore } from '../../store/hierarchyStore'

export default function MachineDrawer() {
  const navigate = useNavigate()
  const { drawerOpen, drawerMachineId, closeDrawer } = useNavigationStore()
  const { machines } = useHierarchyStore()
  const readings = useRealtimeStore((s) => s.readings)

  const [meter, setMeter] = useState<EnergyMeter | null>(null)
  const [history, setHistory] = useState<MeterReading[]>([])
  const [summary, setSummary] = useState<MetricsSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [timeRange, setTimeRange] = useState('1h')

  const machine = machines.find((m) => m.id === drawerMachineId)

  const TIME_OPTIONS = [
    { label: '15m', value: '15m' },
    { label: '1h', value: '1h' },
    { label: '6h', value: '6h' },
    { label: '24h', value: '24h' },
  ]

  const getFromDt = useCallback((range: string) => {
    const now = new Date()
    const map: Record<string, number> = { '15m': 15, '1h': 60, '6h': 360, '24h': 1440 }
    now.setMinutes(now.getMinutes() - (map[range] ?? 60))
    return now.toISOString()
  }, [])

  useEffect(() => {
    if (!drawerOpen || !drawerMachineId) return
    setLoading(true)
    fetchMeters({ machine_id: drawerMachineId })
      .then(async (ms) => {
        const m = ms[0] ?? null
        setMeter(m)
        if (m) {
          const from = getFromDt(timeRange)
          const [hist, summ] = await Promise.all([
            fetchMetricsReadings({ meter_id: m.id, from_dt: from, limit: 300 }),
            fetchMetricsSummary({ meter_id: m.id, from_dt: from }),
          ])
          setHistory([...hist].reverse())
          setSummary(summ)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [drawerOpen, drawerMachineId, timeRange, getFromDt])

  const live = meter ? readings[meter.id] : undefined
  const kw = live?.active_power_kw ?? 0
  const maxKw = machine?.rated_power_kw ?? 400
  const loadPct = Math.min(100, (kw / maxKw) * 100)

  if (!drawerOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        onClick={closeDrawer}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-[480px] max-w-[95vw] bg-surface-900 border-l border-surface-800 z-50 flex flex-col shadow-2xl overflow-hidden"
        style={{ animation: 'slideInRight 0.25s ease-out' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-surface-800 bg-surface-950/50">
          <div>
            <div className="text-xs text-surface-500 font-medium mb-0.5">
              {machine?.section_name} · {machine?.shed_name}
            </div>
            <div className="text-base font-bold text-white">{machine?.name ?? 'Machine'}</div>
            {meter && (
              <div className="flex items-center gap-1.5 mt-1">
                <Radio size={10} className="text-surface-500" />
                <span className="text-[10px] font-mono text-surface-400">{meter.identification}</span>
                <span className="text-[10px] text-surface-600">·</span>
                <span className="text-[10px] text-surface-500">{meter.make} {meter.model}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {meter && (
              <StatusBadge status={live ? 'ONLINE' : (meter.communication_status ?? 'OFFLINE')} size="sm" />
            )}
            <button
              onClick={closeDrawer}
              className="p-1.5 rounded-lg hover:bg-surface-800 text-surface-400 hover:text-surface-200 transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Load bar */}
          <div className="px-5 pt-4 pb-3">
            <div className="flex items-end justify-between mb-2">
              <div>
                <div className="text-[10px] text-surface-500 mb-0.5">Current Load</div>
                <div className="text-3xl font-bold tabular-nums" style={{
                  color: loadPct >= 90 ? '#ef4444' : loadPct >= 75 ? '#f59e0b' : '#3b82f6'
                }}>
                  {fmtKw(kw)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-surface-500 mb-0.5">Load %</div>
                <div className="text-lg font-bold text-surface-300">{loadPct.toFixed(0)}%</div>
              </div>
            </div>
            {/* Progress bar */}
            <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${loadPct}%`,
                  backgroundColor: loadPct >= 90 ? '#ef4444' : loadPct >= 75 ? '#f59e0b' : '#3b82f6',
                }}
              />
            </div>
            <div className="text-[10px] text-surface-600 mt-1">
              Rated: {maxKw} kW · Last: {fmtTimestamp(live?.timestamp)}
            </div>
          </div>

          {/* Electrical params grid */}
          <div className="px-5 pb-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Voltage', value: fmtVolts(live?.voltage_avg), icon: <Zap size={11} />, color: 'text-sky-400' },
                { label: 'Current', value: fmtAmps(live?.current_avg), icon: <Activity size={11} />, color: 'text-violet-400' },
                { label: 'Power Factor', value: fmtPf(live?.power_factor), icon: <Gauge size={11} />, color: live?.power_factor && live.power_factor < 0.85 ? 'text-amber-400' : 'text-emerald-400' },
                { label: 'Frequency', value: fmtHz(live?.frequency), icon: <TrendingUp size={11} />, color: 'text-teal-400' },
                { label: 'Reactive kVAr', value: live?.reactive_power_kvar?.toFixed(1) ?? '—', icon: <Activity size={11} />, color: 'text-orange-400' },
                { label: 'Apparent kVA', value: live?.apparent_power_kva?.toFixed(1) ?? '—', icon: <Zap size={11} />, color: 'text-pink-400' },
              ].map((p) => (
                <div key={p.label} className="bg-surface-800 rounded-lg p-3 text-center">
                  <div className={clsx('text-sm font-bold font-mono tabular-nums', p.color)}>{p.value}</div>
                  <div className="text-[9px] text-surface-500 mt-1">{p.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Summary stats */}
          {summary && (
            <div className="px-5 pb-4">
              <div className="text-[10px] text-surface-500 uppercase tracking-wider font-semibold mb-2">
                Period Summary
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Consumption', value: fmtKwh(summary.total_kwh) },
                  { label: 'Peak Demand', value: fmtKw(summary.max_demand_kw) },
                  { label: 'Avg Power', value: fmtKw(summary.avg_power_kw) },
                  { label: 'Avg PF', value: fmtPf(summary.avg_pf) },
                ].map((s) => (
                  <div key={s.label} className="bg-surface-800/60 rounded-lg px-3 py-2 flex justify-between items-center">
                    <span className="text-xs text-surface-400">{s.label}</span>
                    <span className="text-xs font-bold text-surface-200 font-mono">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Time range selector */}
          <div className="px-5 pb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] text-surface-500 uppercase tracking-wider font-semibold">
                Trend — Active Power
              </div>
              <div className="flex gap-1">
                {TIME_OPTIONS.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTimeRange(t.value)}
                    className={clsx(
                      'px-2 py-0.5 text-[10px] rounded transition-colors',
                      timeRange === t.value
                        ? 'bg-brand-600 text-white'
                        : 'bg-surface-800 text-surface-400 hover:text-surface-200',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="h-28 bg-surface-800 rounded-lg animate-pulse" />
            ) : history.length > 0 ? (
              <ElectricalChart
                readings={history}
                series={[{ field: 'active_power_kw', label: 'kW', color: '#3b82f6', unit: 'kW' }]}
                height={120}
              />
            ) : (
              <div className="h-28 bg-surface-800 rounded-lg flex items-center justify-center text-xs text-surface-500">
                No historical data yet
              </div>
            )}
          </div>

          {/* Phase voltages mini chart */}
          {history.length > 0 && (
            <div className="px-5 pb-4">
              <div className="text-[10px] text-surface-500 uppercase tracking-wider font-semibold mb-3">
                Phase Voltage
              </div>
              <ElectricalChart
                readings={history}
                series={[
                  { field: 'voltage_r', label: 'R', color: '#ef4444', unit: 'V' },
                  { field: 'voltage_y', label: 'Y', color: '#eab308', unit: 'V' },
                  { field: 'voltage_b', label: 'B', color: '#60a5fa', unit: 'V' },
                ]}
                height={110}
              />
            </div>
          )}

          {/* Phase currents mini chart */}
          {history.length > 0 && (
            <div className="px-5 pb-4">
              <div className="text-[10px] text-surface-500 uppercase tracking-wider font-semibold mb-3">
                Phase Current
              </div>
              <ElectricalChart
                readings={history}
                series={[
                  { field: 'current_r', label: 'R', color: '#ef4444', unit: 'A' },
                  { field: 'current_y', label: 'Y', color: '#eab308', unit: 'A' },
                  { field: 'current_b', label: 'B', color: '#60a5fa', unit: 'A' },
                ]}
                height={110}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-surface-800 flex items-center justify-between bg-surface-950/40">
          <div className="text-[10px] text-surface-600">
            {meter ? `${meter.make} ${meter.model} · ${meter.communication_protocol}` : ''}
          </div>
          <button
            onClick={() => {
              closeDrawer()
              navigate('/live-metrics')
            }}
            className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors font-medium"
          >
            Full Analysis
            <ExternalLink size={11} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  )
}
