import { useState, useEffect, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { graphic } from 'echarts'
import TopBar from '../components/layout/TopBar'
import HierarchySelector from '../components/common/HierarchySelector'
import TabBar from '../components/common/TabBar'
import KPICard from '../components/common/KPICard'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { useHierarchy } from '../hooks/useHierarchy'
import { useHierarchyStore } from '../store/hierarchyStore'
import { useNavigationStore } from '../store/navigationStore'
import {
  fetchSectionBreakdown, fetchMachineBreakdown,
  fetchEnergyTrend, fetchEnergyOverview,
  fetchMetricsReadings, fetchMeters,
} from '../api/energy'
import { fetchMachines } from '../api/hierarchy'
import type {
  SectionConsumption, MachineConsumption, EnergyKPI,
  MeterReading, EnergyMeter, Machine,
} from '../types'
import { fmtKwh, fmtKw, fmtPf } from '../utils/formatters'
import { CHART_COLORS } from '../utils/colors'
import {
  TrendingUp, PieChart, BarChart3, Zap, RefreshCw,
  GitCompare, Layers, Plus, X, Check,
} from 'lucide-react'
import clsx from 'clsx'

// ── Tab definitions ────────────────────────────────────────────────────────
const ANALYTICS_TABS = [
  { key: 'consumption',   label: 'Consumption',    icon: <BarChart3  size={13} /> },
  { key: 'distribution',  label: 'Distribution',   icon: <PieChart   size={13} /> },
  { key: 'efficiency',    label: 'Efficiency',     icon: <Zap        size={13} /> },
  { key: 'comparison',    label: 'Period Compare', icon: <TrendingUp size={13} /> },
  { key: 'multi_machine', label: 'Multi-Machine',  icon: <GitCompare size={13} /> },
  { key: 'multi_param',   label: 'Multi-Param',    icon: <Layers     size={13} /> },
]

// ── Available parameters for multi-param comparison ───────────────────────
const PARAM_OPTIONS = [
  { key: 'active_power_kw',    label: 'Active Power (kW)',      unit: 'kW',   color: '#3b82f6' },
  { key: 'reactive_power_kvar',label: 'Reactive Power (kVAr)',  unit: 'kVAr', color: '#f59e0b' },
  { key: 'apparent_power_kva', label: 'Apparent Power (kVA)',   unit: 'kVA',  color: '#8b5cf6' },
  { key: 'power_factor',       label: 'Power Factor',           unit: '',     color: '#22c55e' },
  { key: 'voltage_r',          label: 'Voltage R (V)',          unit: 'V',    color: '#ef4444' },
  { key: 'voltage_y',          label: 'Voltage Y (V)',          unit: 'V',    color: '#eab308' },
  { key: 'voltage_b',          label: 'Voltage B (V)',          unit: 'V',    color: '#60a5fa' },
  { key: 'current_r',          label: 'Current R (A)',          unit: 'A',    color: '#ef4444' },
  { key: 'current_y',          label: 'Current Y (A)',          unit: 'A',    color: '#eab308' },
  { key: 'current_b',          label: 'Current B (A)',          unit: 'A',    color: '#60a5fa' },
  { key: 'frequency',          label: 'Frequency (Hz)',         unit: 'Hz',   color: '#06b6d4' },
]

// ── Main component ─────────────────────────────────────────────────────────
export default function Analytics() {
  const { selectedPlantId, selectedShedId, selectedSectionId } = useHierarchyStore()
  const { analyticsTab, setAnalyticsTab } = useNavigationStore()
  useHierarchy()

  // ── Existing analytics state ────────────────────────────────────────────
  const [sections,     setSections]     = useState<SectionConsumption[]>([])
  const [machines,     setMachines]     = useState<MachineConsumption[]>([])
  const [kpi,          setKpi]          = useState<EnergyKPI | null>(null)
  const [trendCurrent, setTrendCurrent] = useState<{ timestamp: string; value: number }[]>([])
  const [trendPrev,    setTrendPrev]    = useState<{ timestamp: string; value: number }[]>([])
  const [loading,      setLoading]      = useState(false)

  // ── Multi-machine comparison state ──────────────────────────────────────
  const [allMachines,       setAllMachines]       = useState<Machine[]>([])
  const [allMeters,         setAllMeters]         = useState<EnergyMeter[]>([])
  const [selectedMachines,  setSelectedMachines]  = useState<number[]>([])   // machine IDs
  const [mmParam,           setMmParam]           = useState('active_power_kw')
  const [mmReadings,        setMmReadings]        = useState<Record<number, MeterReading[]>>({})
  const [mmLoading,         setMmLoading]         = useState(false)
  const [mmTimeRange,       setMmTimeRange]       = useState('24h')

  // ── Multi-param comparison state ────────────────────────────────────────
  const [mpMachineId,   setMpMachineId]   = useState<number | null>(null)
  const [selectedParams, setSelectedParams] = useState<string[]>(['active_power_kw', 'power_factor', 'voltage_r'])
  const [mpReadings,    setMpReadings]    = useState<MeterReading[]>([])
  const [mpLoading,     setMpLoading]     = useState(false)
  const [mpTimeRange,   setMpTimeRange]   = useState('24h')

  const scopeParams = useCallback(() => ({
    plant_id: selectedPlantId!,
    ...(selectedShedId    ? { shed_id:    selectedShedId    } : {}),
    ...(selectedSectionId ? { section_id: selectedSectionId } : {}),
  }), [selectedPlantId, selectedShedId, selectedSectionId])

  // ── Load base analytics data ─────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!selectedPlantId) return
    setLoading(true)
    try {
      const p   = scopeParams()
      const now = new Date()
      const toDate   = now.toISOString()
      const fromDate = new Date(now.getTime() - 7 * 86400000).toISOString()
      const prevFrom = new Date(now.getTime() - 14 * 86400000).toISOString()

      const [secData, machData, kpiData, curTrend, prevTrend, machs, mts] = await Promise.all([
        fetchSectionBreakdown(p),
        fetchMachineBreakdown({ ...p, top_n: 20 }),
        fetchEnergyOverview(p),
        fetchEnergyTrend({ ...p, granularity: 'daily', from_dt: fromDate, to_dt: toDate }),
        fetchEnergyTrend({ ...p, granularity: 'daily', from_dt: prevFrom, to_dt: fromDate }),
        fetchMachines({ plant_id: selectedPlantId }),
        fetchMeters({ plant_id: selectedPlantId }),
      ])
      setSections(secData)
      setMachines(machData)
      setKpi(kpiData)
      setTrendCurrent(curTrend.data)
      setTrendPrev(prevTrend.data)
      setAllMachines(machs)
      setAllMeters(mts)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [selectedPlantId, selectedShedId, selectedSectionId, scopeParams])

  useEffect(() => { if (selectedPlantId) load() }, [selectedPlantId, selectedShedId, selectedSectionId]) // eslint-disable-line

  // ── Load multi-machine readings ──────────────────────────────────────────
  const loadMultiMachine = useCallback(async () => {
    if (selectedMachines.length === 0) return
    setMmLoading(true)
    try {
      const hours = mmTimeRange === '6h' ? 6 : mmTimeRange === '12h' ? 12 : mmTimeRange === '7d' ? 168 : 24
      const from  = new Date(Date.now() - hours * 3600000).toISOString()
      const meterByMachine = Object.fromEntries(allMeters.map(m => [m.machine_id, m]))
      const results: Record<number, MeterReading[]> = {}
      await Promise.all(
        selectedMachines.map(async machineId => {
          const meter = meterByMachine[machineId]
          if (!meter) return
          const readings = await fetchMetricsReadings({
            meter_id: meter.id,
            from_dt: from,
            limit: 360,
          })
          results[machineId] = [...readings].reverse()
        })
      )
      setMmReadings(results)
    } catch (e) { console.error(e) }
    finally { setMmLoading(false) }
  }, [selectedMachines, mmTimeRange, allMeters])

  useEffect(() => {
    if (analyticsTab === 'multi_machine' && selectedMachines.length > 0) loadMultiMachine()
  }, [analyticsTab, selectedMachines, mmTimeRange]) // eslint-disable-line

  // ── Load multi-param readings ────────────────────────────────────────────
  const loadMultiParam = useCallback(async () => {
    if (!mpMachineId) return
    setMpLoading(true)
    try {
      const hours = mpTimeRange === '6h' ? 6 : mpTimeRange === '12h' ? 12 : mpTimeRange === '7d' ? 168 : 24
      const from  = new Date(Date.now() - hours * 3600000).toISOString()
      const meterByMachine = Object.fromEntries(allMeters.map(m => [m.machine_id, m]))
      const meter = meterByMachine[mpMachineId]
      if (!meter) return
      const readings = await fetchMetricsReadings({ meter_id: meter.id, from_dt: from, limit: 360 })
      setMpReadings([...readings].reverse())
    } catch (e) { console.error(e) }
    finally { setMpLoading(false) }
  }, [mpMachineId, mpTimeRange, allMeters])

  useEffect(() => {
    if (analyticsTab === 'multi_param' && mpMachineId) loadMultiParam()
  }, [analyticsTab, mpMachineId, mpTimeRange]) // eslint-disable-line

  // Auto-select first machine for multi-param when machines load
  useEffect(() => {
    if (allMachines.length > 0 && !mpMachineId) {
      setMpMachineId(allMachines[0].id)
    }
  }, [allMachines]) // eslint-disable-line

  // ── Chart builders ───────────────────────────────────────────────────────

  const sectionPieOption: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', backgroundColor: '#1e293b', borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 11 },
      formatter: (p: any) => `<b>${p.name}</b><br/>${fmtKwh(p.value)} — ${p.percent?.toFixed(1)}%` },
    legend: { orient: 'vertical', right: 0, top: 'middle',
      textStyle: { color: '#94a3b8', fontSize: 10 }, itemWidth: 10, itemHeight: 10 },
    series: [{ type: 'pie', radius: ['45%', '70%'], center: ['35%', '50%'],
      data: sections.map((s, i) => ({ name: s.section_name, value: s.today_kwh,
        itemStyle: { color: CHART_COLORS[i % CHART_COLORS.length] } })),
      label: { show: false },
      emphasis: { itemStyle: { shadowBlur: 12, shadowColor: 'rgba(59,130,246,0.4)' },
        label: { show: true, fontSize: 11, color: '#f1f5f9', formatter: '{b}\n{d}%' } } }],
  }

  const machineBarOption: EChartsOption = {
    backgroundColor: 'transparent',
    grid: { top: 16, right: 12, bottom: 36, left: 120, containLabel: false },
    tooltip: { trigger: 'axis', backgroundColor: '#1e293b', borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 11 } },
    xAxis: { type: 'value', axisLabel: { color: '#64748b', fontSize: 9,
        formatter: (v: number) => fmtKwh(v) },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      axisLine: { show: false }, axisTick: { show: false } },
    yAxis: { type: 'category', data: machines.slice(0, 12).map(m => m.machine_name).reverse(),
      axisLabel: { color: '#94a3b8', fontSize: 10 },
      axisLine: { lineStyle: { color: '#334155' } }, axisTick: { show: false } },
    series: [{ type: 'bar',
      data: machines.slice(0, 12).map((m, i) => ({ value: m.today_kwh,
        itemStyle: { color: new graphic.LinearGradient(0, 0, 1, 0,
          [{ offset: 0, color: 'rgba(59,130,246,0.2)' }, { offset: 1, color: CHART_COLORS[i % CHART_COLORS.length] }]),
          borderRadius: [0, 4, 4, 0] } })).reverse(),
      barMaxWidth: 18 }],
  }

  const comparisonOption: EChartsOption = {
    backgroundColor: 'transparent',
    grid: { top: 36, right: 20, bottom: 40, left: 56 },
    legend: { top: 8, textStyle: { color: '#94a3b8', fontSize: 10 }, data: ['This Week', 'Previous Week'] },
    tooltip: { trigger: 'axis', backgroundColor: '#1e293b', borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 11 } },
    xAxis: { type: 'category', data: trendCurrent.map((_, i) => `Day ${i + 1}`),
      axisLabel: { color: '#64748b', fontSize: 10 },
      axisLine: { lineStyle: { color: '#334155' } }, axisTick: { show: false } },
    yAxis: { type: 'value', axisLabel: { color: '#64748b', fontSize: 10,
        formatter: (v: number) => fmtKwh(v) },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      axisLine: { show: false }, axisTick: { show: false } },
    series: [
      { name: 'This Week', type: 'bar', data: trendCurrent.map(d => d.value),
        itemStyle: { color: '#3b82f6', borderRadius: [3, 3, 0, 0] }, barGap: '10%' },
      { name: 'Previous Week', type: 'bar', data: trendPrev.map(d => d.value),
        itemStyle: { color: '#64748b', borderRadius: [3, 3, 0, 0] } },
    ],
  }

  const efficiencyOption: EChartsOption = {
    backgroundColor: 'transparent',
    grid: { top: 24, right: 24, bottom: 40, left: 60 },
    tooltip: { trigger: 'item', backgroundColor: '#1e293b', borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 11 },
      formatter: (p: any) => {
        const m = machines[p.dataIndex]
        return m ? `<b>${m.machine_name}</b><br/>PF: ${m.power_factor?.toFixed(3) ?? '—'}<br/>kW: ${m.current_kw.toFixed(0)}` : ''
      } },
    xAxis: { name: 'Load (kW)', nameTextStyle: { color: '#64748b', fontSize: 10 },
      type: 'value', axisLabel: { color: '#64748b', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      axisLine: { lineStyle: { color: '#334155' } }, axisTick: { show: false } },
    yAxis: { name: 'Power Factor', nameTextStyle: { color: '#64748b', fontSize: 10 },
      type: 'value', min: 0.7, max: 1.0,
      axisLabel: { color: '#64748b', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      axisLine: { show: false }, axisTick: { show: false } },
    series: [{ type: 'scatter',
      data: machines.map(m => [m.current_kw, m.power_factor ?? 0.85]),
      symbolSize: (val: number[]) => Math.max(8, Math.min(28, val[0] / 15)),
      itemStyle: { color: (p: any) => {
        const pf = (p.data as number[])[1]
        return pf >= 0.9 ? '#22c55e' : pf >= 0.85 ? '#f59e0b' : '#ef4444'
      }, opacity: 0.75 } }],
  }

  // ── Multi-machine chart ──────────────────────────────────────────────────
  const paramInfo = PARAM_OPTIONS.find(p => p.key === mmParam) ?? PARAM_OPTIONS[0]

  const buildMultiMachineOption = (): EChartsOption => {
    const machineById = Object.fromEntries(allMachines.map(m => [m.id, m]))
    const timestamps = Object.values(mmReadings)[0]?.map(r => {
      const d = new Date(r.timestamp)
      return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    }) ?? []

    return {
      backgroundColor: 'transparent',
      grid: { top: 48, right: 20, bottom: 48, left: 56 },
      legend: { top: 8, textStyle: { color: '#94a3b8', fontSize: 10 },
        data: selectedMachines.map(id => machineById[id]?.name ?? String(id)) },
      tooltip: { trigger: 'axis', backgroundColor: '#1e293b', borderColor: '#334155',
        textStyle: { color: '#e2e8f0', fontSize: 11 } },
      xAxis: { type: 'category', data: timestamps,
        axisLabel: { color: '#64748b', fontSize: 9,
          interval: Math.floor((timestamps.length || 1) / 6) },
        axisLine: { lineStyle: { color: '#334155' } }, axisTick: { show: false } },
      yAxis: { type: 'value', name: paramInfo.unit,
        nameTextStyle: { color: '#64748b', fontSize: 10 },
        axisLabel: { color: '#64748b', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
        axisLine: { show: false }, axisTick: { show: false } },
      series: selectedMachines.map((machineId, idx) => {
        const data = mmReadings[machineId] ?? []
        return {
          name: machineById[machineId]?.name ?? String(machineId),
          type: 'line',
          data: data.map(r => (r as any)[mmParam] ?? null),
          smooth: true,
          symbol: 'none',
          lineStyle: { color: CHART_COLORS[idx % CHART_COLORS.length], width: 1.5 },
          itemStyle: { color: CHART_COLORS[idx % CHART_COLORS.length] },
        }
      }),
      dataZoom: [{ type: 'inside' }],
    }
  }

  // ── Multi-param chart ────────────────────────────────────────────────────
  const buildMultiParamOption = (): EChartsOption => {
    const timestamps = mpReadings.map(r => {
      const d = new Date(r.timestamp)
      return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    })

    // Normalise each param to 0–100 range for overlay
    const normalise = (values: (number | null)[]): number[] => {
      const nums = values.filter((v): v is number => v !== null)
      if (nums.length === 0) return values.map(() => 0)
      const mn = Math.min(...nums)
      const mx = Math.max(...nums)
      const rng = mx - mn || 1
      return values.map(v => v === null ? 0 : ((v - mn) / rng) * 100)
    }

    return {
      backgroundColor: 'transparent',
      grid: { top: 48, right: 20, bottom: 48, left: 56 },
      legend: { top: 8, textStyle: { color: '#94a3b8', fontSize: 10 },
        data: selectedParams.map(k => PARAM_OPTIONS.find(p => p.key === k)?.label ?? k) },
      tooltip: {
        trigger: 'axis', backgroundColor: '#1e293b', borderColor: '#334155',
        textStyle: { color: '#e2e8f0', fontSize: 11 },
        formatter: (params: any) => {
          const items = Array.isArray(params) ? params : [params]
          return `<div style="font-size:10px;color:#64748b">${items[0]?.axisValue ?? ''}</div>` +
            items.map((p: any) => {
              const paramKey = selectedParams[p.seriesIndex]
              const raw = mpReadings[p.dataIndex]
              const rawVal = raw ? (raw as any)[paramKey] : null
              const pInfo = PARAM_OPTIONS.find(opt => opt.key === paramKey)
              return `<span style="color:${p.color}">●</span> ${pInfo?.label ?? paramKey}: <b>${rawVal != null ? rawVal.toFixed(2) : '—'} ${pInfo?.unit ?? ''}</b>`
            }).join('<br/>')
        },
      },
      xAxis: { type: 'category', data: timestamps,
        axisLabel: { color: '#64748b', fontSize: 9,
          interval: Math.floor((timestamps.length || 1) / 6) },
        axisLine: { lineStyle: { color: '#334155' } }, axisTick: { show: false } },
      yAxis: { type: 'value', name: 'Normalised (0–100)',
        nameTextStyle: { color: '#64748b', fontSize: 10 },
        axisLabel: { color: '#64748b', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
        axisLine: { show: false }, axisTick: { show: false } },
      series: selectedParams.map(paramKey => {
        const pInfo = PARAM_OPTIONS.find(p => p.key === paramKey)
        const raw = mpReadings.map(r => (r as any)[paramKey] as number | null)
        return {
          name: pInfo?.label ?? paramKey,
          type: 'line',
          data: normalise(raw),
          smooth: true,
          symbol: 'none',
          lineStyle: { color: pInfo?.color ?? '#94a3b8', width: 1.5 },
          itemStyle: { color: pInfo?.color ?? '#94a3b8' },
        }
      }),
      dataZoom: [{ type: 'inside' }],
    }
  }

  // ── Time range helper ────────────────────────────────────────────────────
  const TIME_RANGES = [
    { key: '6h', label: '6h' },
    { key: '12h', label: '12h' },
    { key: '24h', label: '24h' },
    { key: '7d', label: '7d' },
  ]

  function TimeRangePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
      <div className="flex gap-1">
        {TIME_RANGES.map(t => (
          <button key={t.key} onClick={() => onChange(t.key)}
            className={clsx('px-2 py-1 text-[10px] rounded transition-colors',
              value === t.key ? 'bg-brand-600 text-white' : 'bg-surface-800 text-surface-400 hover:text-surface-200'
            )}>
            {t.label}
          </button>
        ))}
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Analytics"
        actions={
          <button onClick={load} className="btn-secondary text-xs gap-1.5 py-1.5">
            <RefreshCw size={12} /><span className="hidden sm:inline">Refresh</span>
          </button>
        }
      />

      <div className="px-5 py-2.5 border-b border-surface-800 bg-surface-950/60 flex items-center gap-3">
        <HierarchySelector showSection compact />
      </div>

      <div className="px-5 bg-surface-950/40 overflow-x-auto">
        <TabBar tabs={ANALYTICS_TABS} active={analyticsTab} onChange={setAnalyticsTab} />
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <LoadingSpinner label="Loading analytics…" size="lg" />
          </div>
        ) : (
          <>
            {/* ── CONSUMPTION TAB ──────────────────────────────── */}
            {analyticsTab === 'consumption' && (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KPICard label="Today's Total"    value={fmtKwh(kpi?.today_kwh)}           accent="blue" />
                  <KPICard label="Yesterday"         value={fmtKwh(kpi?.yesterday_kwh)}       accent="green" />
                  <KPICard label="This Month"        value={fmtKwh(kpi?.current_month_kwh)}   accent="purple" />
                  <KPICard label="Previous Month"    value={fmtKwh(kpi?.previous_month_kwh)}  accent="amber" />
                </div>
                <div className="card">
                  <div className="card-header">
                    <span className="text-sm font-semibold text-surface-200">Top Machines — Today's Consumption</span>
                  </div>
                  <div className="p-4">
                    {machines.length === 0
                      ? <p className="text-xs text-surface-500 text-center py-10">No data yet</p>
                      : <ReactECharts option={machineBarOption} style={{ height: 320, width: '100%' }} opts={{ renderer: 'canvas' }} />
                    }
                  </div>
                </div>
              </div>
            )}

            {/* ── DISTRIBUTION TAB ─────────────────────────────── */}
            {analyticsTab === 'distribution' && (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="card">
                    <div className="card-header"><span className="text-sm font-semibold text-surface-200">Section-wise Share</span></div>
                    <div className="p-4">
                      {sections.length === 0
                        ? <p className="text-xs text-surface-500 text-center py-10">Waiting for data…</p>
                        : <ReactECharts option={sectionPieOption} style={{ height: 280, width: '100%' }} opts={{ renderer: 'canvas' }} />
                      }
                    </div>
                  </div>
                  <div className="card overflow-hidden">
                    <div className="card-header"><span className="text-sm font-semibold text-surface-200">Section Breakdown</span></div>
                    <div className="divide-y divide-surface-800/50">
                      {sections.map((s, i) => (
                        <div key={s.section_id} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-surface-200">{s.section_name}</div>
                            <div className="text-[10px] text-surface-500">{s.shed_name} · {s.meter_count} meters</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-bold font-mono text-brand-400">{fmtKwh(s.today_kwh)}</div>
                            <div className="text-[10px] text-surface-500">{s.pct_of_total.toFixed(1)}%</div>
                          </div>
                        </div>
                      ))}
                      {sections.length === 0 && <div className="py-8 text-center text-xs text-surface-500">No section data</div>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── EFFICIENCY TAB ───────────────────────────────── */}
            {analyticsTab === 'efficiency' && (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'PF ≥ 0.90',   value: machines.filter(m => (m.power_factor ?? 0) >= 0.9).length,               accent: 'green' as const },
                    { label: 'PF 0.85–0.90', value: machines.filter(m => (m.power_factor ?? 0) >= 0.85 && (m.power_factor ?? 0) < 0.9).length, accent: 'amber' as const },
                    { label: 'PF < 0.85',    value: machines.filter(m => (m.power_factor ?? 0) > 0 && (m.power_factor ?? 0) < 0.85).length,   accent: 'red'   as const },
                  ].map(s => <KPICard key={s.label} label={s.label} value={String(s.value)} accent={s.accent} />)}
                </div>
                <div className="card">
                  <div className="card-header">
                    <span className="text-sm font-semibold text-surface-200">Power Factor vs Load</span>
                    <div className="flex items-center gap-3 text-[10px]">
                      {[['#22c55e','≥0.90'],['#f59e0b','0.85–0.90'],['#ef4444','<0.85']].map(([c,l]) => (
                        <span key={l} className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: c }} />{l}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="p-4">
                    {machines.length === 0
                      ? <p className="text-xs text-surface-500 text-center py-10">No data yet</p>
                      : <ReactECharts option={efficiencyOption} style={{ height: 300, width: '100%' }} opts={{ renderer: 'canvas' }} />
                    }
                  </div>
                </div>
                {machines.filter(m => (m.power_factor ?? 1) < 0.9 && m.power_factor != null).length > 0 && (
                  <div className="card overflow-hidden">
                    <div className="card-header">
                      <span className="text-sm font-semibold text-amber-400">⚠ Low Power Factor Machines</span>
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-surface-800">
                          {['Machine','Section','PF','kW Now','Action'].map(h => (
                            <th key={h} className="text-left text-[10px] text-surface-500 font-semibold px-4 py-2">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {machines.filter(m => (m.power_factor ?? 1) < 0.9 && m.power_factor != null)
                          .sort((a, b) => (a.power_factor ?? 1) - (b.power_factor ?? 1))
                          .map(m => (
                            <tr key={m.machine_id} className="border-b border-surface-800/40">
                              <td className="px-4 py-2.5 text-sm font-medium text-surface-200">{m.machine_name}</td>
                              <td className="px-4 py-2.5 text-xs text-surface-400">{m.section_name}</td>
                              <td className="px-4 py-2.5">
                                <span className={`font-mono font-bold text-sm ${(m.power_factor ?? 1) < 0.85 ? 'text-red-400' : 'text-amber-400'}`}>
                                  {fmtPf(m.power_factor)}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 font-mono text-sm text-blue-400">{fmtKw(m.current_kw)}</td>
                              <td className="px-4 py-2.5 text-xs text-brand-400">Consider APFC</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── PERIOD COMPARE TAB ───────────────────────────── */}
            {analyticsTab === 'comparison' && (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KPICard label="This Month"    value={fmtKwh(kpi?.current_month_kwh)}  accent="blue" />
                  <KPICard label="Previous Month" value={fmtKwh(kpi?.previous_month_kwh)} accent="purple" />
                  <KPICard label="Month-on-Month"
                    value={`${kpi && kpi.mom_change_pct >= 0 ? '+' : ''}${kpi?.mom_change_pct.toFixed(1) ?? 0}%`}
                    accent={kpi && kpi.mom_change_pct <= 0 ? 'green' : 'red'} />
                  <KPICard label="Avg Power Factor" value={fmtPf(kpi?.avg_power_factor)} accent="amber" />
                </div>
                <div className="card">
                  <div className="card-header">
                    <span className="text-sm font-semibold text-surface-200">This Week vs Previous Week</span>
                  </div>
                  <div className="p-4">
                    {trendCurrent.length === 0
                      ? <p className="text-xs text-surface-500 text-center py-10">No trend data available yet</p>
                      : <ReactECharts option={comparisonOption} style={{ height: 280, width: '100%' }} opts={{ renderer: 'canvas' }} />
                    }
                  </div>
                </div>
                {trendCurrent.length > 0 && trendPrev.length > 0 && (
                  <div className="card overflow-hidden">
                    <div className="card-header">
                      <span className="text-sm font-semibold text-surface-200">Daily Comparison</span>
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-surface-800">
                          {['Day','This Week','Previous Week','Difference','Change %'].map(h => (
                            <th key={h} className="text-left text-[10px] text-surface-500 font-semibold px-4 py-2">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {trendCurrent.map((cur, i) => {
                          const prev = trendPrev[i]
                          const diff = cur.value - (prev?.value ?? 0)
                          const pct  = prev?.value ? (diff / prev.value) * 100 : 0
                          return (
                            <tr key={i} className="border-b border-surface-800/40">
                              <td className="px-4 py-2 text-xs text-surface-400 font-mono">
                                {new Date(cur.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                              </td>
                              <td className="px-4 py-2 font-mono text-sm font-bold text-blue-400">{fmtKwh(cur.value)}</td>
                              <td className="px-4 py-2 font-mono text-sm text-surface-400">{prev ? fmtKwh(prev.value) : '—'}</td>
                              <td className="px-4 py-2 font-mono text-xs">
                                <span className={diff > 0 ? 'text-red-400' : 'text-emerald-400'}>
                                  {diff > 0 ? '+' : ''}{fmtKwh(diff)}
                                </span>
                              </td>
                              <td className="px-4 py-2">
                                <span className={`text-xs font-bold ${pct > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                  {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── MULTI-MACHINE COMPARISON TAB ─────────────────── */}
            {analyticsTab === 'multi_machine' && (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                  {/* Left panel: machine selector */}
                  <div className="card">
                    <div className="card-header">
                      <span className="text-sm font-semibold text-surface-200">Select Machines</span>
                      <span className="text-[10px] text-surface-500">{selectedMachines.length} selected</span>
                    </div>
                    <div className="p-3 space-y-1 max-h-96 overflow-y-auto">
                      {allMachines.length === 0 && (
                        <p className="text-xs text-surface-500 text-center py-4">Loading machines…</p>
                      )}
                      {allMachines.map(m => {
                        const isSelected = selectedMachines.includes(m.id)
                        return (
                          <button
                            key={m.id}
                            onClick={() => setSelectedMachines(prev =>
                              isSelected
                                ? prev.filter(id => id !== m.id)
                                : prev.length >= 8 ? prev : [...prev, m.id]
                            )}
                            className={clsx(
                              'w-full flex items-center justify-between px-2.5 py-2 rounded text-xs transition-all text-left',
                              isSelected
                                ? 'bg-brand-600/20 text-brand-300 border border-brand-600/30'
                                : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800',
                            )}
                          >
                            <div className="min-w-0">
                              <div className="font-medium truncate">{m.name}</div>
                              <div className="text-[9px] text-surface-600 truncate">{m.section_name}</div>
                            </div>
                            {isSelected && (
                              <div
                                className="w-2 h-2 rounded-full shrink-0 ml-1"
                                style={{ backgroundColor: CHART_COLORS[selectedMachines.indexOf(m.id) % CHART_COLORS.length] }}
                              />
                            )}
                          </button>
                        )
                      })}
                    </div>
                    {selectedMachines.length > 0 && (
                      <div className="p-2 border-t border-surface-800">
                        <button
                          onClick={() => setSelectedMachines([])}
                          className="w-full text-xs text-surface-500 hover:text-red-400 transition-colors py-1"
                        >
                          Clear all
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Right panel: chart + controls */}
                  <div className="lg:col-span-3 space-y-3">
                    {/* Controls row */}
                    <div className="card p-3 flex flex-wrap items-center gap-3">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[9px] text-surface-500 uppercase tracking-wider font-medium">Parameter</label>
                        <select
                          className="select-field text-xs py-1.5 min-w-[200px]"
                          value={mmParam}
                          onChange={e => setMmParam(e.target.value)}
                        >
                          {PARAM_OPTIONS.map(p => (
                            <option key={p.key} value={p.key}>{p.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[9px] text-surface-500 uppercase tracking-wider font-medium">Time Range</label>
                        <TimeRangePicker value={mmTimeRange} onChange={setMmTimeRange} />
                      </div>
                      <button
                        onClick={loadMultiMachine}
                        disabled={selectedMachines.length === 0}
                        className="btn-primary text-xs gap-1.5 py-1.5 mt-4 disabled:opacity-40"
                      >
                        <RefreshCw size={12} /> Compare
                      </button>
                    </div>

                    {/* Chart */}
                    <div className="card">
                      <div className="card-header">
                        <span className="text-sm font-semibold text-surface-200">
                          {paramInfo.label} — Machine Comparison
                        </span>
                        <span className="text-xs text-surface-500">
                          {selectedMachines.length === 0 ? 'Select machines on the left' : `${selectedMachines.length} machines · ${mmTimeRange}`}
                        </span>
                      </div>
                      <div className="p-4">
                        {mmLoading ? (
                          <div className="flex justify-center py-10"><LoadingSpinner /></div>
                        ) : selectedMachines.length === 0 ? (
                          <div className="py-12 text-center text-surface-500">
                            <GitCompare size={28} className="mx-auto mb-3 opacity-40" />
                            <p className="text-sm">Select 2–8 machines from the panel to compare</p>
                          </div>
                        ) : Object.keys(mmReadings).length === 0 ? (
                          <div className="py-12 text-center text-surface-500">
                            <p className="text-sm">Click Compare to load data</p>
                          </div>
                        ) : (
                          <ReactECharts
                            option={buildMultiMachineOption()}
                            style={{ height: 360, width: '100%' }}
                            opts={{ renderer: 'canvas' }}
                          />
                        )}
                      </div>
                    </div>

                    {/* Summary stats table */}
                    {Object.keys(mmReadings).length > 0 && (
                      <div className="card overflow-hidden">
                        <div className="card-header">
                          <span className="text-sm font-semibold text-surface-200">Comparison Summary — {paramInfo.label}</span>
                        </div>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-surface-800">
                              <th className="text-left text-[10px] text-surface-500 font-semibold px-4 py-2">Machine</th>
                              <th className="text-left text-[10px] text-surface-500 font-semibold px-4 py-2">Min</th>
                              <th className="text-left text-[10px] text-surface-500 font-semibold px-4 py-2">Max</th>
                              <th className="text-left text-[10px] text-surface-500 font-semibold px-4 py-2">Average</th>
                              <th className="text-left text-[10px] text-surface-500 font-semibold px-4 py-2">Latest</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedMachines.map((machineId, idx) => {
                              const machineObj = allMachines.find(m => m.id === machineId)
                              const data = (mmReadings[machineId] ?? []).map(r => (r as any)[mmParam] as number | null).filter((v): v is number => v != null)
                              const mn  = data.length ? Math.min(...data) : null
                              const mx  = data.length ? Math.max(...data) : null
                              const avg = data.length ? data.reduce((s, v) => s + v, 0) / data.length : null
                              const lat = data[data.length - 1] ?? null
                              const colour = CHART_COLORS[idx % CHART_COLORS.length]
                              return (
                                <tr key={machineId} className="border-b border-surface-800/40">
                                  <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colour }} />
                                      <span className="font-medium text-surface-200">{machineObj?.name}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 font-mono text-surface-300">{mn != null ? mn.toFixed(2) : '—'}</td>
                                  <td className="px-4 py-2.5 font-mono text-surface-300">{mx != null ? mx.toFixed(2) : '—'}</td>
                                  <td className="px-4 py-2.5 font-mono font-bold text-brand-400">{avg != null ? avg.toFixed(2) : '—'}</td>
                                  <td className="px-4 py-2.5 font-mono text-surface-300">{lat != null ? lat.toFixed(2) : '—'}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── MULTI-PARAM COMPARISON TAB ───────────────────── */}
            {analyticsTab === 'multi_param' && (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                  {/* Left: parameter selector */}
                  <div className="card">
                    <div className="card-header">
                      <span className="text-sm font-semibold text-surface-200">Parameters</span>
                      <span className="text-[10px] text-surface-500">{selectedParams.length} selected</span>
                    </div>
                    <div className="p-3 space-y-1">
                      {PARAM_OPTIONS.map(p => {
                        const isSelected = selectedParams.includes(p.key)
                        return (
                          <button
                            key={p.key}
                            onClick={() => setSelectedParams(prev =>
                              isSelected
                                ? prev.length > 1 ? prev.filter(k => k !== p.key) : prev
                                : prev.length >= 6 ? prev : [...prev, p.key]
                            )}
                            className={clsx(
                              'w-full flex items-center gap-2 px-2.5 py-2 rounded text-xs transition-all text-left',
                              isSelected
                                ? 'bg-brand-600/20 text-brand-300 border border-brand-600/30'
                                : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800',
                            )}
                          >
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                            <span className="flex-1 truncate">{p.label}</span>
                            {isSelected && <Check size={10} className="text-brand-400 shrink-0" />}
                          </button>
                        )
                      })}
                    </div>
                    <div className="px-3 pb-3 pt-2 border-t border-surface-800 text-[10px] text-surface-500 leading-relaxed">
                      All parameters are normalised to 0–100 scale for overlay comparison.
                      Hover tooltips show real values.
                    </div>
                  </div>

                  {/* Right: chart */}
                  <div className="lg:col-span-3 space-y-3">
                    {/* Controls */}
                    <div className="card p-3 flex flex-wrap items-center gap-3">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[9px] text-surface-500 uppercase tracking-wider font-medium">Machine</label>
                        <select
                          className="select-field text-xs py-1.5 min-w-[200px]"
                          value={mpMachineId ?? ''}
                          onChange={e => setMpMachineId(e.target.value ? Number(e.target.value) : null)}
                        >
                          <option value="">Select machine…</option>
                          {allMachines.map(m => (
                            <option key={m.id} value={m.id}>{m.name} ({m.section_name})</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[9px] text-surface-500 uppercase tracking-wider font-medium">Time Range</label>
                        <TimeRangePicker value={mpTimeRange} onChange={setMpTimeRange} />
                      </div>
                      <button
                        onClick={loadMultiParam}
                        disabled={!mpMachineId}
                        className="btn-primary text-xs gap-1.5 py-1.5 mt-4 disabled:opacity-40"
                      >
                        <RefreshCw size={12} /> Load
                      </button>
                    </div>

                    <div className="card">
                      <div className="card-header">
                        <span className="text-sm font-semibold text-surface-200">
                          Multi-Parameter Overlay — {allMachines.find(m => m.id === mpMachineId)?.name ?? 'Select machine'}
                        </span>
                        <span className="text-xs text-surface-500">Normalised scale · hover for real values</span>
                      </div>
                      <div className="p-4">
                        {mpLoading ? (
                          <div className="flex justify-center py-10"><LoadingSpinner /></div>
                        ) : mpReadings.length === 0 ? (
                          <div className="py-12 text-center text-surface-500">
                            <Layers size={28} className="mx-auto mb-3 opacity-40" />
                            <p className="text-sm">Select a machine and click Load</p>
                          </div>
                        ) : (
                          <ReactECharts
                            option={buildMultiParamOption()}
                            style={{ height: 360, width: '100%' }}
                            opts={{ renderer: 'canvas' }}
                          />
                        )}
                      </div>
                    </div>

                    {/* Raw values table */}
                    {mpReadings.length > 0 && (
                      <div className="card overflow-hidden">
                        <div className="card-header">
                          <span className="text-sm font-semibold text-surface-200">Parameter Summary (latest reading)</span>
                        </div>
                        {(() => {
                          const latest = mpReadings[mpReadings.length - 1]
                          return (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 divide-x divide-y divide-surface-800">
                              {selectedParams.map(key => {
                                const pInfo = PARAM_OPTIONS.find(p => p.key === key)
                                const val   = latest ? (latest as any)[key] as number | null : null
                                return (
                                  <div key={key} className="px-4 py-3">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: pInfo?.color }} />
                                      <div className="text-[9px] text-surface-500 truncate">{pInfo?.label}</div>
                                    </div>
                                    <div className="text-base font-bold font-mono" style={{ color: pInfo?.color }}>
                                      {val != null ? val.toFixed(2) : '—'}
                                      <span className="text-xs text-surface-500 ml-1">{pInfo?.unit}</span>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
