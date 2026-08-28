import { useState, useEffect, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { graphic } from 'echarts'
import TopBar from '../components/layout/TopBar'
import HierarchySelector from '../components/common/HierarchySelector'
import TabBar from '../components/common/TabBar'
import KPICard from '../components/common/KPICard'
import { useHierarchy } from '../hooks/useHierarchy'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { useHierarchyStore } from '../store/hierarchyStore'
import { useNavigationStore } from '../store/navigationStore'
import { fetchSectionBreakdown, fetchMachineBreakdown, fetchEnergyTrend, fetchEnergyOverview } from '../api/energy'
import type { SectionConsumption, MachineConsumption, EnergyKPI } from '../types'
import { fmtKwh, fmtKw, fmtPf } from '../utils/formatters'
import { CHART_COLORS } from '../utils/colors'
import { TrendingUp, PieChart, BarChart3, Zap, RefreshCw } from 'lucide-react'

const ANALYTICS_TABS = [
  { key: 'consumption', label: 'Consumption', icon: <BarChart3 size={13} /> },
  { key: 'distribution', label: 'Distribution', icon: <PieChart size={13} /> },
  { key: 'efficiency', label: 'Efficiency', icon: <Zap size={13} /> },
  { key: 'comparison', label: 'Period Compare', icon: <TrendingUp size={13} /> },
]

export default function Analytics() {
  const { selectedPlantId, selectedShedId, selectedSectionId } = useHierarchyStore()
  const { analyticsTab, setAnalyticsTab } = useNavigationStore()
  useHierarchy() // ensures plant auto-select fires on direct navigation to this page

  const [sections, setSections] = useState<SectionConsumption[]>([])
  const [machines, setMachines] = useState<MachineConsumption[]>([])
  const [kpi, setKpi] = useState<EnergyKPI | null>(null)
  const [trendCurrent, setTrendCurrent] = useState<{ timestamp: string; value: number }[]>([])
  const [trendPrev, setTrendPrev] = useState<{ timestamp: string; value: number }[]>([])
  const [loading, setLoading] = useState(false)

  const scopeParams = useCallback(() => ({
    plant_id: selectedPlantId!,
    ...(selectedShedId ? { shed_id: selectedShedId } : {}),
    ...(selectedSectionId ? { section_id: selectedSectionId } : {}),
  }), [selectedPlantId, selectedShedId, selectedSectionId])

  const load = useCallback(async () => {
    if (!selectedPlantId) return
    setLoading(true)
    try {
      const p = scopeParams()
      const now = new Date()

      // Current 7 days
      const toDate = now.toISOString()
      const fromDate = new Date(now.getTime() - 7 * 86400000).toISOString()

      // Previous 7 days
      const prevTo = fromDate
      const prevFrom = new Date(now.getTime() - 14 * 86400000).toISOString()

      const [secData, machData, kpiData, curTrend, prevTrend] = await Promise.all([
        fetchSectionBreakdown(p),
        fetchMachineBreakdown({ ...p, top_n: 20 }),
        fetchEnergyOverview(p),
        fetchEnergyTrend({ ...p, granularity: 'daily', from_dt: fromDate, to_dt: toDate }),
        fetchEnergyTrend({ ...p, granularity: 'daily', from_dt: prevFrom, to_dt: prevTo }),
      ])
      setSections(secData)
      setMachines(machData)
      setKpi(kpiData)
      setTrendCurrent(curTrend.data)
      setTrendPrev(prevTrend.data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [selectedPlantId, selectedShedId, selectedSectionId, scopeParams])

  useEffect(() => {
    if (selectedPlantId) load()
  }, [selectedPlantId, selectedShedId, selectedSectionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Chart options ──────────────────────────────────────────────────

  const sectionPieOption: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 11 },
      formatter: (p: any) => `<b>${p.name}</b><br/>${fmtKwh(p.value)} — ${p.percent?.toFixed(1)}%`,
    },
    legend: {
      orient: 'vertical', right: 0, top: 'middle',
      textStyle: { color: '#94a3b8', fontSize: 10 },
      itemWidth: 10, itemHeight: 10,
    },
    series: [{
      type: 'pie',
      radius: ['45%', '70%'],
      center: ['35%', '50%'],
      data: sections.map((s, i) => ({
        name: s.section_name,
        value: s.today_kwh,
        itemStyle: { color: CHART_COLORS[i % CHART_COLORS.length] },
      })),
      label: { show: false },
      emphasis: {
        itemStyle: { shadowBlur: 12, shadowColor: 'rgba(59,130,246,0.4)' },
        label: { show: true, fontSize: 11, color: '#f1f5f9', formatter: '{b}\n{d}%' },
      },
    }],
  }

  const machineBarOption: EChartsOption = {
    backgroundColor: 'transparent',
    grid: { top: 16, right: 12, bottom: 36, left: 120, containLabel: false },
    tooltip: {
      trigger: 'axis', backgroundColor: '#1e293b', borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 11 },
      formatter: (p: any) => {
        const items = Array.isArray(p) ? p : [p]
        return items.map((i: any) =>
          `<span style="color:${i.color}">●</span> ${i.name}: <b>${fmtKwh(i.value)}</b>`
        ).join('<br/>')
      },
    },
    xAxis: {
      type: 'value',
      axisLabel: { color: '#64748b', fontSize: 9, formatter: (v: number) => fmtKwh(v) },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      axisLine: { show: false }, axisTick: { show: false },
    },
    yAxis: {
      type: 'category',
      data: machines.slice(0, 12).map((m) => m.machine_name).reverse(),
      axisLabel: { color: '#94a3b8', fontSize: 10 },
      axisLine: { lineStyle: { color: '#334155' } }, axisTick: { show: false },
    },
    series: [{
      type: 'bar',
      data: machines.slice(0, 12).map((m, i) => ({
        value: m.today_kwh,
        itemStyle: {
          color: new graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: 'rgba(59,130,246,0.2)' },
            { offset: 1, color: CHART_COLORS[i % CHART_COLORS.length] },
          ]),
          borderRadius: [0, 4, 4, 0],
        },
      })).reverse(),
      barMaxWidth: 18,
      label: {
        show: true, position: 'right', color: '#64748b', fontSize: 9,
        formatter: (p: any) => fmtKwh(machines.slice(0, 12).reverse()[p.dataIndex]?.today_kwh ?? 0),
      },
    }],
  }

  const comparisonOption: EChartsOption = {
    backgroundColor: 'transparent',
    grid: { top: 36, right: 20, bottom: 40, left: 56 },
    legend: {
      top: 8, textStyle: { color: '#94a3b8', fontSize: 10 },
      data: ['This Week', 'Previous Week'],
    },
    tooltip: {
      trigger: 'axis', backgroundColor: '#1e293b', borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 11 },
    },
    xAxis: {
      type: 'category',
      data: trendCurrent.map((_, i) => `Day ${i + 1}`),
      axisLabel: { color: '#64748b', fontSize: 10 },
      axisLine: { lineStyle: { color: '#334155' } }, axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#64748b', fontSize: 10, formatter: (v: number) => fmtKwh(v) },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      axisLine: { show: false }, axisTick: { show: false },
    },
    series: [
      {
        name: 'This Week',
        type: 'bar',
        data: trendCurrent.map((d) => d.value),
        itemStyle: { color: '#3b82f6', borderRadius: [3, 3, 0, 0] },
        barGap: '10%',
      },
      {
        name: 'Previous Week',
        type: 'bar',
        data: trendPrev.map((d) => d.value),
        itemStyle: { color: '#64748b', borderRadius: [3, 3, 0, 0] },
      },
    ],
  }

  // PF efficiency bubble-ish chart: x=kW, y=PF, size=energy
  const efficiencyOption: EChartsOption = {
    backgroundColor: 'transparent',
    grid: { top: 24, right: 24, bottom: 40, left: 60 },
    tooltip: {
      trigger: 'item', backgroundColor: '#1e293b', borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 11 },
      formatter: (p: any) => {
        const m = machines[p.dataIndex]
        return m ? `<b>${m.machine_name}</b><br/>PF: ${m.power_factor?.toFixed(3) ?? '—'}<br/>kW: ${m.current_kw.toFixed(0)}<br/>kWh: ${fmtKwh(m.today_kwh)}` : ''
      },
    },
    xAxis: {
      name: 'Current Load (kW)', nameTextStyle: { color: '#64748b', fontSize: 10 },
      type: 'value',
      axisLabel: { color: '#64748b', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      axisLine: { lineStyle: { color: '#334155' } }, axisTick: { show: false },
    },
    yAxis: {
      name: 'Power Factor', nameTextStyle: { color: '#64748b', fontSize: 10 },
      type: 'value', min: 0.7, max: 1.0,
      axisLabel: { color: '#64748b', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      axisLine: { show: false }, axisTick: { show: false },
    },
    // PF 0.9 reference line
    markLine: { silent: true, lineStyle: { color: '#22c55e', type: 'dashed', width: 1 } },
    series: [{
      type: 'scatter',
      data: machines.map((m, i) => [m.current_kw, m.power_factor ?? 0.85]),
      symbolSize: (val: number[]) => Math.max(8, Math.min(28, val[0] / 15)),
      itemStyle: {
        color: (params: any) => {
          const pf = (params.data as number[])[1]
          return pf >= 0.9 ? '#22c55e' : pf >= 0.85 ? '#f59e0b' : '#ef4444'
        },
        opacity: 0.75,
      },
    }],
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Analytics"
        actions={
          <button onClick={load} className="btn-secondary text-xs gap-1.5 py-1.5">
            <RefreshCw size={12} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        }
      />

      <div className="px-5 py-2.5 border-b border-surface-800 bg-surface-950/60 flex items-center gap-3">
        <HierarchySelector showSection compact />
      </div>

      <div className="px-5 bg-surface-950/40">
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
                {/* KPI summary row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KPICard label="Today's Total" value={fmtKwh(kpi?.today_kwh)} accent="blue" />
                  <KPICard label="Yesterday" value={fmtKwh(kpi?.yesterday_kwh)} accent="green" />
                  <KPICard label="This Month" value={fmtKwh(kpi?.current_month_kwh)} accent="purple" />
                  <KPICard label="Previous Month" value={fmtKwh(kpi?.previous_month_kwh)} accent="amber" />
                </div>

                {/* Machines ranked bar */}
                <div className="card">
                  <div className="card-header">
                    <span className="text-sm font-semibold text-surface-200">Top Machines — Today's Consumption</span>
                  </div>
                  <div className="p-4">
                    {machines.length === 0
                      ? <p className="text-xs text-surface-500 text-center py-10">No data — simulator generates readings every 30s</p>
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
                  {/* Pie chart */}
                  <div className="card">
                    <div className="card-header">
                      <span className="text-sm font-semibold text-surface-200">Section-wise Share</span>
                    </div>
                    <div className="p-4">
                      {sections.length === 0
                        ? <p className="text-xs text-surface-500 text-center py-10">Waiting for data…</p>
                        : <ReactECharts option={sectionPieOption} style={{ height: 280, width: '100%' }} opts={{ renderer: 'canvas' }} />
                      }
                    </div>
                  </div>

                  {/* Section detail table */}
                  <div className="card overflow-hidden">
                    <div className="card-header">
                      <span className="text-sm font-semibold text-surface-200">Section Breakdown</span>
                    </div>
                    <div className="divide-y divide-surface-800/50">
                      {sections.map((s, i) => (
                        <div key={s.section_id} className="flex items-center gap-3 px-4 py-2.5">
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                          />
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
                      {sections.length === 0 && (
                        <div className="py-8 text-center text-xs text-surface-500">No section data</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── EFFICIENCY TAB ───────────────────────────────── */}
            {analyticsTab === 'efficiency' && (
              <div className="p-5 space-y-4">
                {/* PF stats */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Machines ≥ 0.90 PF', value: machines.filter((m) => (m.power_factor ?? 0) >= 0.9).length, accent: 'green' as const },
                    { label: 'Machines 0.85–0.90', value: machines.filter((m) => (m.power_factor ?? 0) >= 0.85 && (m.power_factor ?? 0) < 0.9).length, accent: 'amber' as const },
                    { label: 'Machines < 0.85 PF', value: machines.filter((m) => (m.power_factor ?? 0) > 0 && (m.power_factor ?? 0) < 0.85).length, accent: 'red' as const },
                  ].map((s) => (
                    <KPICard key={s.label} label={s.label} value={String(s.value)} accent={s.accent} />
                  ))}
                </div>

                {/* Scatter plot */}
                <div className="card">
                  <div className="card-header">
                    <span className="text-sm font-semibold text-surface-200">Power Factor vs Load — All Machines</span>
                    <div className="flex items-center gap-3 text-[10px]">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> PF ≥ 0.90</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> 0.85–0.90</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> &lt; 0.85</span>
                    </div>
                  </div>
                  <div className="p-4">
                    {machines.length === 0
                      ? <p className="text-xs text-surface-500 text-center py-10">No data yet</p>
                      : <ReactECharts option={efficiencyOption} style={{ height: 300, width: '100%' }} opts={{ renderer: 'canvas' }} />
                    }
                  </div>
                </div>

                {/* Low PF machines table */}
                {machines.filter((m) => (m.power_factor ?? 1) < 0.9 && m.power_factor !== undefined).length > 0 && (
                  <div className="card overflow-hidden">
                    <div className="card-header">
                      <span className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                        ⚠ Low Power Factor Machines
                      </span>
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-surface-800">
                          {['Machine', 'Section', 'PF', 'kW Now', 'Action'].map((h) => (
                            <th key={h} className="text-left text-[10px] text-surface-500 font-semibold px-4 py-2">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {machines
                          .filter((m) => (m.power_factor ?? 1) < 0.9 && m.power_factor !== undefined)
                          .sort((a, b) => (a.power_factor ?? 1) - (b.power_factor ?? 1))
                          .map((m) => (
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

            {/* ── PERIOD COMPARISON TAB ────────────────────────── */}
            {analyticsTab === 'comparison' && (
              <div className="p-5 space-y-4">
                {/* MoM summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KPICard label="This Month" value={fmtKwh(kpi?.current_month_kwh)} accent="blue" />
                  <KPICard label="Previous Month" value={fmtKwh(kpi?.previous_month_kwh)} accent="purple" />
                  <KPICard
                    label="Month-on-Month"
                    value={`${kpi && kpi.mom_change_pct >= 0 ? '+' : ''}${kpi?.mom_change_pct.toFixed(1) ?? 0}%`}
                    accent={kpi && kpi.mom_change_pct <= 0 ? 'green' : 'red'}
                  />
                  <KPICard label="Avg Power Factor" value={fmtPf(kpi?.avg_power_factor)} accent="amber" />
                </div>

                {/* Week-on-week bar comparison */}
                <div className="card">
                  <div className="card-header">
                    <span className="text-sm font-semibold text-surface-200">This Week vs Previous Week (Daily)</span>
                  </div>
                  <div className="p-4">
                    {trendCurrent.length === 0
                      ? <p className="text-xs text-surface-500 text-center py-10">No trend data available yet</p>
                      : <ReactECharts option={comparisonOption} style={{ height: 280, width: '100%' }} opts={{ renderer: 'canvas' }} />
                    }
                  </div>
                </div>

                {/* Day-by-day delta table */}
                {trendCurrent.length > 0 && trendPrev.length > 0 && (
                  <div className="card overflow-hidden">
                    <div className="card-header">
                      <span className="text-sm font-semibold text-surface-200">Daily Comparison</span>
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-surface-800">
                          {['Day', 'This Week', 'Previous Week', 'Difference', 'Change %'].map((h) => (
                            <th key={h} className="text-left text-[10px] text-surface-500 font-semibold px-4 py-2">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {trendCurrent.map((cur, i) => {
                          const prev = trendPrev[i]
                          const diff = cur.value - (prev?.value ?? 0)
                          const pct = prev?.value ? (diff / prev.value) * 100 : 0
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
          </>
        )}
      </div>
    </div>
  )
}
