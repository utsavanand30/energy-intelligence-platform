/**
 * MeterDetail — Detailed per-meter electrical parameter view
 *
 * Matches the reference "Volts / Amps" meter detail screen:
 *   - Three horizontal phase lines (R/Y/B) with phase voltage, line voltage,
 *     current, and per-phase power shown along each line
 *   - Bottom summary row: I avg, kW total, kVAR total, kVA total, Vin avg
 *   - Right panel: Frequency and Power Factor
 *   - Tabs: Volts/Amps | Trend | History
 *   - Real-time updates from WebSocket store
 *   - Navigated to from SLD (clicking a node) or from Energy Hub
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import TopBar from '../components/layout/TopBar'
import TabBar from '../components/common/TabBar'
import { useRealtimeStore } from '../store/realtimeStore'
import { fetchMeters, fetchMeterLatest } from '../api/energy'
import { fetchMetricsReadings } from '../api/energy'
import type { EnergyMeter, MeterReading } from '../types'
import { fmtTimestamp, fmtDatetime } from '../utils/formatters'
import { ArrowLeft, RefreshCw, Wifi, WifiOff, Activity } from 'lucide-react'
import clsx from 'clsx'

// ── Phase colour constants ──────────────────────────────────────────────────
const R_COLOR = '#ef4444'  // red
const Y_COLOR = '#f59e0b'  // amber/orange
const B_COLOR = '#3b82f6'  // blue

const DETAIL_TABS = [
  { key: 'phase',   label: 'Volts / Amps' },
  { key: 'trend',   label: 'Trend Charts' },
  { key: 'history', label: 'Recent Readings' },
]

// ── Sub-components ──────────────────────────────────────────────────────────

/** Small value box used in the summary strip */
function ValueBox({
  label, value, unit, color, large,
}: {
  label: string; value: string | number; unit?: string; color?: string; large?: boolean
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-3 border-r border-surface-700 last:border-r-0">
      <div className={clsx('font-bold font-mono tabular-nums', large ? 'text-xl' : 'text-base')}
        style={{ color: color ?? '#f1f5f9' }}>
        {value}
        {unit && <span className="text-xs ml-1 text-surface-400">{unit}</span>}
      </div>
      <div className="text-[9px] text-surface-500 mt-0.5 text-center">{label}</div>
    </div>
  )
}

/** Single horizontal phase line — matches reference diagram */
function PhaseLine({
  phase, color, vLN, vLL, vLLLabel, current, power,
}: {
  phase: 'R' | 'Y' | 'B'
  color: string
  vLN?: number
  vLL?: number
  vLLLabel: string
  current?: number
  power?: number
}) {
  const fmt1 = (v?: number) => v != null ? v.toFixed(2) : '—'

  return (
    <div className="flex items-center gap-0 min-h-[72px]">
      {/* Phase label bullet */}
      <div className="flex items-center gap-2 w-20 shrink-0">
        <div className="w-3 h-3 rounded-full border-2 shrink-0" style={{ borderColor: color, backgroundColor: `${color}20` }} />
        <span className="text-sm font-bold" style={{ color }}>{phase} Phase</span>
      </div>

      {/* Phase line with nodes */}
      <div className="flex-1 flex items-center relative">
        {/* Horizontal line */}
        <div className="absolute left-0 right-0 h-px" style={{ backgroundColor: color, opacity: 0.6 }} />

        {/* Node 1: Phase voltage L-N */}
        <div className="relative z-10 flex flex-col items-center mr-6">
          <div className="w-3 h-3 rounded-full border-2 bg-surface-900 shrink-0" style={{ borderColor: color }} />
          {/* Voltage value below */}
          <div className="mt-2 text-center">
            <div className="text-[11px] font-bold font-mono" style={{ color }}>
              {fmt1(vLN)} V
            </div>
            <div className="text-[8px] text-surface-500">V{phase}N</div>
          </div>
        </div>

        {/* L-L voltage shown between phases (below the line) */}
        <div className="relative z-10 flex flex-col items-center mr-6">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color, opacity: 0.5 }} />
          <div className="mt-2 text-center">
            <div className="text-[10px] font-mono text-surface-400">
              {fmt1(vLL)} V
            </div>
            <div className="text-[8px] text-surface-500">{vLLLabel}</div>
          </div>
        </div>

        {/* Node 2: Current */}
        <div className="relative z-10 flex flex-col items-center mr-6">
          {/* Arrow → */}
          <div className="flex items-center gap-1">
            <div className="w-4 h-px" style={{ backgroundColor: color }} />
            <div className="w-0 h-0 border-t-4 border-b-4 border-l-4 border-transparent" style={{ borderLeftColor: color }} />
          </div>
          <div className="mt-2 text-center">
            <div className="text-[11px] font-bold font-mono" style={{ color }}>
              I{phase} {fmt1(current)} A
            </div>
            <div className="text-[8px] text-surface-500">Phase Current</div>
          </div>
        </div>

        {/* Arrow connector */}
        <div className="relative z-10 flex flex-col items-center mr-6">
          <div className="flex items-center gap-1">
            <div className="w-4 h-px" style={{ backgroundColor: color }} />
            <div className="w-0 h-0 border-t-4 border-b-4 border-l-4 border-transparent" style={{ borderLeftColor: color }} />
          </div>
          <div className="mt-2 text-center">
            <div className="text-[11px] font-bold font-mono text-surface-300">
              {fmt1(power)} kW
            </div>
            <div className="text-[8px] text-surface-500">Power</div>
          </div>
        </div>

        {/* End line to terminal */}
        <div className="flex-1 relative">
          <div className="absolute left-0 right-0 h-px top-0" style={{ backgroundColor: color, opacity: 0.3 }} />
        </div>
      </div>
    </div>
  )
}

/** Trend chart for a set of series */
function TrendChart({
  readings, series, height = 180,
}: {
  readings: MeterReading[]
  series: { field: keyof MeterReading; label: string; color: string; unit: string }[]
  height?: number
}) {
  const option: EChartsOption = {
    backgroundColor: 'transparent',
    grid: { top: 32, right: 16, bottom: 32, left: 52, containLabel: false },
    legend: { top: 4, textStyle: { color: '#64748b', fontSize: 10 }, itemWidth: 10, itemHeight: 2 },
    tooltip: {
      trigger: 'axis', backgroundColor: '#1e293b', borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 11 },
      formatter: (params: any) => {
        const items = Array.isArray(params) ? params : [params]
        const ts = new Date(readings[items[0]?.dataIndex]?.timestamp ?? '').toLocaleTimeString('en-IN')
        return `<div style="color:#64748b;font-size:10px">${ts}</div>` +
          items.map((p: any) => {
            const cfg = series[p.seriesIndex]
            return `<span style="color:${cfg?.color}">●</span> ${cfg?.label}: <b>${Number(p.value).toFixed(2)} ${cfg?.unit}</b>`
          }).join('<br/>')
      },
    },
    xAxis: {
      type: 'category',
      data: readings.map(r => r.timestamp),
      axisLabel: { color: '#64748b', fontSize: 9,
        formatter: (v: string) => new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        interval: Math.floor(readings.length / 5),
      },
      axisLine: { lineStyle: { color: '#334155' } }, axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#64748b', fontSize: 9 },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      axisLine: { show: false }, axisTick: { show: false },
    },
    series: series.map(cfg => ({
      name: cfg.label,
      type: 'line',
      data: readings.map(r => r[cfg.field] as number ?? null),
      smooth: true, symbol: 'none',
      lineStyle: { color: cfg.color, width: 1.5 },
      itemStyle: { color: cfg.color },
    })),
    dataZoom: [{ type: 'inside' }],
  }
  return <ReactECharts option={option} style={{ height, width: '100%' }} opts={{ renderer: 'canvas' }} />
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function MeterDetail() {
  const { meterId } = useParams<{ meterId: string }>()
  const navigate = useNavigate()
  const readings = useRealtimeStore(s => s.readings)

  const [meter, setMeter]         = useState<EnergyMeter | null>(null)
  const [history, setHistory]     = useState<MeterReading[]>([])
  const [activeTab, setActiveTab] = useState('phase')
  const [loading, setLoading]     = useState(false)
  const [timeRange, setTimeRange] = useState('24h')

  const mId = Number(meterId)

  // Load meter metadata
  useEffect(() => {
    if (!mId) return
    fetchMeters({ machine_id: undefined }).then(async (all) => {
      const found = all.find(m => m.id === mId)
      if (!found) {
        // try direct fetch
        const latest = await fetchMeterLatest(mId)
        if (latest) setMeter({ id: mId } as EnergyMeter)
      } else {
        setMeter(found)
      }
    }).catch(console.error)
  }, [mId])

  // Load history
  const loadHistory = async () => {
    if (!mId) return
    setLoading(true)
    try {
      const hours = timeRange === '1h' ? 1 : timeRange === '6h' ? 6 : timeRange === '12h' ? 12 : 24
      const from = new Date(Date.now() - hours * 3600000).toISOString()
      const data = await fetchMetricsReadings({ meter_id: mId, from_dt: from, limit: 720 })
      setHistory([...data].reverse())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadHistory() }, [mId, timeRange]) // eslint-disable-line

  // Live reading from WebSocket
  const live = readings[mId]

  // Derived values
  const vRN  = live?.voltage_r
  const vYN  = live?.voltage_y
  const vBN  = live?.voltage_b
  const vRY  = live?.voltage_ry
  const vYB  = live?.voltage_yb
  const vBR  = live?.voltage_br
  const iR   = live?.current_r
  const iY   = live?.current_y
  const iB   = live?.current_b
  const freq = live?.frequency
  const pf   = live?.power_factor
  const kw   = live?.active_power_kw
  const kvar = live?.reactive_power_kvar
  const kva  = live?.apparent_power_kva

  // Phase power (estimated as kW / 3 per phase)
  const phKw = kw != null ? kw / 3 : undefined

  // Averages
  const iAvg = iR != null && iY != null && iB != null
    ? (iR + iY + iB) / 3 : undefined
  const vAvg = vRN != null && vYN != null && vBN != null
    ? (vRN + vYN + vBN) / 3 : undefined

  const isOnline = live != null
  const meterName = meter?.machine_name ?? meter?.identification ?? `Meter ${mId}`

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Meter Detail"
        subtitle={meterName}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="btn-secondary text-xs gap-1.5 py-1.5"
            >
              <ArrowLeft size={12} /> Back
            </button>
            <button onClick={loadHistory} className="btn-secondary text-xs gap-1.5 py-1.5">
              <RefreshCw size={12} />
            </button>
          </div>
        }
      />

      {/* Meter info bar */}
      <div className="px-5 py-2.5 border-b border-surface-800 bg-surface-950/60 flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className={clsx('w-2 h-2 rounded-full', isOnline ? 'bg-energy-green animate-pulse' : 'bg-energy-red')} />
          <span className="font-medium text-surface-200">{meterName}</span>
        </div>
        {meter?.identification && (
          <span className="font-mono text-surface-400">{meter.identification}</span>
        )}
        {meter?.make && (
          <span className="text-surface-500">{meter.make} {meter.model}</span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {isOnline ? <Wifi size={12} className="text-energy-green" /> : <WifiOff size={12} className="text-energy-red" />}
          <span className={isOnline ? 'text-energy-green' : 'text-energy-red'}>
            {isOnline ? `Live · ${fmtTimestamp(live?.timestamp)}` : 'No live data'}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-5 bg-surface-950/40">
        <TabBar tabs={DETAIL_TABS} active={activeTab} onChange={setActiveTab} size="sm" />
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── VOLTS / AMPS TAB ─────────────────────────────────────── */}
        {activeTab === 'phase' && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

              {/* ── Main phase diagram ──────────────────────────── */}
              <div className="xl:col-span-2 card">
                <div className="card-header">
                  <span className="text-sm font-semibold text-surface-200 flex items-center gap-2">
                    <Activity size={14} className="text-brand-400" />
                    Phase Diagram — {meterName}
                  </span>
                  <span className="text-[10px] text-surface-500">
                    {isOnline ? `Updated ${fmtTimestamp(live?.timestamp)}` : 'Waiting for data…'}
                  </span>
                </div>

                <div className="p-6 space-y-2">
                  {/* Column headers */}
                  <div className="flex items-center gap-0 mb-1 pl-20">
                    <div className="w-28 text-[9px] text-surface-500 uppercase tracking-wider">Volts L-N</div>
                    <div className="w-28 text-[9px] text-surface-500 uppercase tracking-wider">Volts L-L</div>
                    <div className="w-32 text-[9px] text-surface-500 uppercase tracking-wider">Phase Current</div>
                    <div className="w-28 text-[9px] text-surface-500 uppercase tracking-wider">Power</div>
                  </div>

                  {/* Three phase lines */}
                  <PhaseLine
                    phase="R" color={R_COLOR}
                    vLN={vRN} vLL={vRY} vLLLabel="VRY"
                    current={iR} power={phKw}
                  />
                  <div className="border-t border-surface-800/60" />
                  <PhaseLine
                    phase="Y" color={Y_COLOR}
                    vLN={vYN} vLL={vYB} vLLLabel="VYB"
                    current={iY} power={phKw}
                  />
                  <div className="border-t border-surface-800/60" />
                  <PhaseLine
                    phase="B" color={B_COLOR}
                    vLN={vBN} vLL={vBR} vLLLabel="VBR"
                    current={iB} power={phKw}
                  />
                </div>

                {/* Summary strip */}
                <div className="border-t border-surface-800 bg-surface-950/40">
                  <div className="flex flex-wrap divide-x divide-surface-700">
                    <ValueBox label="kW total"   value={kw   != null ? kw.toFixed(2)   : '—'} unit="kW"   color="#3b82f6" />
                    <ValueBox label="kVAR total"  value={kvar != null ? kvar.toFixed(2) : '—'} unit="kVAr" color="#f59e0b" />
                    <ValueBox label="kVA total"   value={kva  != null ? kva.toFixed(2)  : '—'} unit="kVA"  color="#8b5cf6" />
                    <ValueBox label="I average"   value={iAvg != null ? iAvg.toFixed(2) : '—'} unit="A"    color="#94a3b8" />
                    <ValueBox label="Vin average" value={vAvg != null ? vAvg.toFixed(2) : '—'} unit="V"    color="#94a3b8" />
                  </div>
                </div>

                {/* Phase voltages bottom row */}
                <div className="px-6 py-3 border-t border-surface-800 flex flex-wrap gap-6 text-xs">
                  {[
                    { label: 'VRN', value: vRN, color: R_COLOR },
                    { label: 'VYN', value: vYN, color: Y_COLOR },
                    { label: 'VBN', value: vBN, color: B_COLOR },
                    { label: 'VRY', value: vRY, color: '#a855f7' },
                    { label: 'VYB', value: vYB, color: '#a855f7' },
                    { label: 'VBR', value: vBR, color: '#a855f7' },
                  ].map(v => (
                    <div key={v.label} className="text-center">
                      <div className="font-mono font-bold" style={{ color: v.color }}>
                        {v.value != null ? v.value.toFixed(2) : '—'} <span className="text-[9px] text-surface-500">V</span>
                      </div>
                      <div className="text-[9px] text-surface-500">{v.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Right panel: Frequency + PF + Phase currents ── */}
              <div className="space-y-4">
                {/* Frequency card */}
                <div className="card p-5 text-center">
                  <div className="text-[10px] text-surface-500 uppercase tracking-wider mb-2">Frequency</div>
                  <div className="text-4xl font-bold font-mono text-cyan-400 tabular-nums">
                    {freq != null ? freq.toFixed(2) : '—'}
                  </div>
                  <div className="text-sm text-surface-400 mt-1">Hz</div>
                  {freq != null && (
                    <div className={clsx('mt-2 text-[10px] font-medium',
                      Math.abs(freq - 50) < 0.2 ? 'text-emerald-400' : 'text-amber-400')}>
                      {Math.abs(freq - 50) < 0.2 ? '✓ Normal' : '⚠ Deviation'}
                    </div>
                  )}
                </div>

                {/* Power Factor card */}
                <div className="card p-5 text-center">
                  <div className="text-[10px] text-surface-500 uppercase tracking-wider mb-2">Power Factor</div>
                  <div className={clsx('text-4xl font-bold font-mono tabular-nums',
                    pf == null ? 'text-surface-400' :
                    pf >= 0.9  ? 'text-emerald-400' :
                    pf >= 0.85 ? 'text-amber-400'   : 'text-red-400')}>
                    {pf != null ? pf.toFixed(3) : '—'}
                  </div>
                  {pf != null && (
                    <>
                      {/* PF arc indicator */}
                      <div className="mt-3 w-full bg-surface-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${Math.min(100, pf * 100)}%`,
                            backgroundColor: pf >= 0.9 ? '#22c55e' : pf >= 0.85 ? '#f59e0b' : '#ef4444',
                          }}
                        />
                      </div>
                      <div className={clsx('mt-1.5 text-[10px] font-medium',
                        pf >= 0.9 ? 'text-emerald-400' : pf >= 0.85 ? 'text-amber-400' : 'text-red-400')}>
                        {pf >= 0.9 ? '✓ Good' : pf >= 0.85 ? '⚠ Fair' : '✗ Poor — check capacitors'}
                      </div>
                    </>
                  )}
                </div>

                {/* Per-phase current card */}
                <div className="card p-4">
                  <div className="text-[10px] text-surface-500 uppercase tracking-wider mb-3">Phase Currents</div>
                  <div className="space-y-2">
                    {[
                      { label: 'R Phase', value: iR, color: R_COLOR },
                      { label: 'Y Phase', value: iY, color: Y_COLOR },
                      { label: 'B Phase', value: iB, color: B_COLOR },
                    ].map(p => {
                      const maxI = Math.max(iR ?? 0, iY ?? 0, iB ?? 0, 1)
                      const pct  = p.value != null ? (p.value / maxI) * 100 : 0
                      return (
                        <div key={p.label}>
                          <div className="flex justify-between text-xs mb-1">
                            <span style={{ color: p.color }} className="font-medium">{p.label}</span>
                            <span className="font-mono" style={{ color: p.color }}>
                              {p.value != null ? p.value.toFixed(1) : '—'} A
                            </span>
                          </div>
                          <div className="h-1.5 bg-surface-800 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${pct}%`, backgroundColor: p.color }} />
                          </div>
                        </div>
                      )
                    })}
                    {iAvg != null && (
                      <div className="pt-2 border-t border-surface-800 flex justify-between text-xs">
                        <span className="text-surface-500">Average</span>
                        <span className="font-mono font-bold text-surface-300">{iAvg.toFixed(1)} A</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Meter info card */}
                <div className="card p-4 space-y-1.5 text-xs">
                  <div className="text-[10px] text-surface-500 uppercase tracking-wider mb-2">Meter Info</div>
                  {[
                    { label: 'Meter ID', value: meter?.identification },
                    { label: 'Make',     value: meter?.make },
                    { label: 'Model',    value: meter?.model },
                    { label: 'Protocol', value: meter?.communication_protocol },
                    { label: 'CT Ratio', value: meter?.ct_ratio != null ? `${meter.ct_ratio}:1` : undefined },
                  ].filter(r => r.value).map(r => (
                    <div key={r.label} className="flex justify-between">
                      <span className="text-surface-500">{r.label}</span>
                      <span className="font-mono text-surface-300">{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TREND CHARTS TAB ──────────────────────────────────────── */}
        {activeTab === 'trend' && (
          <div className="p-5 space-y-4">
            {/* Time range selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-surface-500">Time range:</span>
              {['1h','6h','12h','24h'].map(t => (
                <button key={t} onClick={() => setTimeRange(t)}
                  className={clsx('px-2.5 py-1 text-xs rounded transition-colors',
                    timeRange === t ? 'bg-brand-600 text-white' : 'bg-surface-800 text-surface-400 hover:text-surface-200'
                  )}>
                  {t}
                </button>
              ))}
              <button onClick={loadHistory} className="ml-2 btn-secondary text-xs gap-1.5 py-1">
                <RefreshCw size={11} /> Reload
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <div className="card p-10 text-center text-surface-500 text-sm">
                No historical data for this time range
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="card">
                  <div className="card-header"><span className="text-sm font-semibold text-surface-200">Active Power (kW)</span></div>
                  <div className="p-3">
                    <TrendChart readings={history} height={160}
                      series={[{ field: 'active_power_kw', label: 'kW', color: '#3b82f6', unit: 'kW' }]} />
                  </div>
                </div>
                <div className="card">
                  <div className="card-header"><span className="text-sm font-semibold text-surface-200">Power Factor</span></div>
                  <div className="p-3">
                    <TrendChart readings={history} height={160}
                      series={[{ field: 'power_factor', label: 'PF', color: '#22c55e', unit: '' }]} />
                  </div>
                </div>
                <div className="card">
                  <div className="card-header"><span className="text-sm font-semibold text-surface-200">Phase Voltage L-N (V)</span></div>
                  <div className="p-3">
                    <TrendChart readings={history} height={160} series={[
                      { field: 'voltage_r', label: 'VR', color: R_COLOR, unit: 'V' },
                      { field: 'voltage_y', label: 'VY', color: Y_COLOR, unit: 'V' },
                      { field: 'voltage_b', label: 'VB', color: B_COLOR, unit: 'V' },
                    ]} />
                  </div>
                </div>
                <div className="card">
                  <div className="card-header"><span className="text-sm font-semibold text-surface-200">Phase Current (A)</span></div>
                  <div className="p-3">
                    <TrendChart readings={history} height={160} series={[
                      { field: 'current_r', label: 'IR', color: R_COLOR, unit: 'A' },
                      { field: 'current_y', label: 'IY', color: Y_COLOR, unit: 'A' },
                      { field: 'current_b', label: 'IB', color: B_COLOR, unit: 'A' },
                    ]} />
                  </div>
                </div>
                <div className="card">
                  <div className="card-header"><span className="text-sm font-semibold text-surface-200">Reactive & Apparent Power</span></div>
                  <div className="p-3">
                    <TrendChart readings={history} height={160} series={[
                      { field: 'reactive_power_kvar', label: 'kVAr', color: '#f59e0b', unit: 'kVAr' },
                      { field: 'apparent_power_kva',  label: 'kVA',  color: '#8b5cf6', unit: 'kVA'  },
                    ]} />
                  </div>
                </div>
                <div className="card">
                  <div className="card-header"><span className="text-sm font-semibold text-surface-200">Frequency (Hz)</span></div>
                  <div className="p-3">
                    <TrendChart readings={history} height={160}
                      series={[{ field: 'frequency', label: 'Hz', color: '#06b6d4', unit: 'Hz' }]} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── HISTORY TABLE TAB ─────────────────────────────────────── */}
        {activeTab === 'history' && (
          <div className="p-5">
            <div className="card overflow-hidden">
              <div className="card-header">
                <span className="text-sm font-semibold text-surface-200">Recent Readings — {history.length} rows</span>
                <button onClick={loadHistory} className="btn-secondary text-xs gap-1.5 py-1">
                  <RefreshCw size={11} /> Refresh
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[900px]">
                  <thead>
                    <tr className="border-b border-surface-800">
                      {['Timestamp','VRN','VYN','VBN','IR','IY','IB','kW','kVAr','kVA','PF','Hz'].map(h => (
                        <th key={h} className="text-left text-[10px] text-surface-500 font-semibold px-3 py-2.5 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...history].reverse().slice(0, 100).map((r, i) => (
                      <tr key={r.id ?? i} className="border-b border-surface-800/30 hover:bg-surface-800/30 transition-colors">
                        <td className="px-3 py-2 font-mono text-surface-400">{fmtTimestamp(r.timestamp)}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: R_COLOR }}>{r.voltage_r?.toFixed(1) ?? '—'}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: Y_COLOR }}>{r.voltage_y?.toFixed(1) ?? '—'}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: B_COLOR }}>{r.voltage_b?.toFixed(1) ?? '—'}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: R_COLOR }}>{r.current_r?.toFixed(1) ?? '—'}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: Y_COLOR }}>{r.current_y?.toFixed(1) ?? '—'}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: B_COLOR }}>{r.current_b?.toFixed(1) ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-blue-400 font-bold">{r.active_power_kw?.toFixed(2) ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-amber-400">{r.reactive_power_kvar?.toFixed(2) ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-purple-400">{r.apparent_power_kva?.toFixed(2) ?? '—'}</td>
                        <td className="px-3 py-2 font-mono">
                          <span className={clsx(r.power_factor == null ? 'text-surface-500' :
                            r.power_factor >= 0.9 ? 'text-emerald-400' :
                            r.power_factor >= 0.85 ? 'text-amber-400' : 'text-red-400')}>
                            {r.power_factor?.toFixed(3) ?? '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-cyan-400">{r.frequency?.toFixed(2) ?? '—'}</td>
                      </tr>
                    ))}
                    {history.length === 0 && (
                      <tr><td colSpan={12} className="text-center py-10 text-surface-500 text-sm">No data</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
