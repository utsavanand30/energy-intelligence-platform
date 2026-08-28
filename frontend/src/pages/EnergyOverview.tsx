import { useState, useEffect, useCallback } from 'react'
import TopBar from '../components/layout/TopBar'
import HierarchySelector from '../components/common/HierarchySelector'
import TabBar from '../components/common/TabBar'
import KPICard from '../components/common/KPICard'
import EnergyTrendChart from '../components/charts/EnergyTrendChart'
import SectionBarChart from '../components/charts/SectionBarChart'
import StatusBadge from '../components/common/StatusBadge'
import LoadingSpinner from '../components/common/LoadingSpinner'
import MachineDrawer from '../components/machines/MachineDrawer'
import { useHierarchyStore } from '../store/hierarchyStore'
import { useNavigationStore } from '../store/navigationStore'
import { useRealtimeStore } from '../store/realtimeStore'
import {
  fetchEnergyOverview, fetchEnergyTrend,
  fetchSectionBreakdown, fetchMachineBreakdown, fetchAlerts,
} from '../api/energy'
import type {
  EnergyKPI, EnergyTrend, SectionConsumption, MachineConsumption, Alert,
} from '../types'
import { fmtKwh, fmtKw, fmtPf, fmt, pctChange } from '../utils/formatters'
import {
  Zap, TrendingUp, Activity, Gauge, BarChart2, Wifi,
  RefreshCw, ArrowUpRight, AlertTriangle, ChevronUp, ChevronDown,
  LayoutGrid, BarChart, Layers, Cpu, Bell,
} from 'lucide-react'
import clsx from 'clsx'

const OVERVIEW_TABS = [
  { key: 'overview',  label: 'Overview',  icon: <LayoutGrid size={13} /> },
  { key: 'trend',     label: 'Trend',     icon: <BarChart size={13} /> },
  { key: 'sections',  label: 'Sections',  icon: <Layers size={13} /> },
  { key: 'machines',  label: 'Machines',  icon: <Cpu size={13} /> },
  { key: 'alerts',    label: 'Alerts',    icon: <Bell size={13} /> },
]

const GRANULARITY = [
  { key: 'hourly', label: 'Hourly' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
]

export default function EnergyOverview() {
  const { selectedPlantId, selectedShedId, selectedSectionId } = useHierarchyStore()
  const { overviewTab, setOverviewTab, openDrawer } = useNavigationStore()
  const readings = useRealtimeStore((s) => s.readings)

  const [kpi, setKpi] = useState<EnergyKPI | null>(null)
  const [trend, setTrend] = useState<EnergyTrend | null>(null)
  const [sections, setSections] = useState<SectionConsumption[]>([])
  const [machines, setMachines] = useState<MachineConsumption[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [granularity, setGranularity] = useState('hourly')
  const [topN, setTopN] = useState(10)
  const [loading, setLoading] = useState(false)  // false until we have a plantId to fetch
  const [trendLoading, setTrendLoading] = useState(false)
  const [machinesSort, setMachinesSort] = useState<'kwh' | 'kw'>('kwh')

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
      const [kpiData, secData, machData, alertData] = await Promise.all([
        fetchEnergyOverview(p),
        fetchSectionBreakdown(p),
        fetchMachineBreakdown({ ...p, top_n: topN }),
        fetchAlerts(),
      ])
      setKpi(kpiData)
      setSections(secData)
      setMachines(machData)
      setAlerts(alertData)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [selectedPlantId, selectedShedId, selectedSectionId, topN, scopeParams])

  const loadTrend = useCallback(async () => {
    if (!selectedPlantId) return
    setTrendLoading(true)
    try {
      const data = await fetchEnergyTrend({ ...scopeParams(), granularity })
      setTrend(data)
    } catch (e) { console.error(e) }
    finally { setTrendLoading(false) }
  }, [selectedPlantId, selectedShedId, selectedSectionId, granularity, scopeParams])

  useEffect(() => {
    if (selectedPlantId) load()
  }, [selectedPlantId, selectedShedId, selectedSectionId, topN]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedPlantId) loadTrend()
  }, [selectedPlantId, selectedShedId, selectedSectionId, granularity]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])

  const mom = kpi ? pctChange(kpi.current_month_kwh, kpi.previous_month_kwh) : null

  const sortedMachines = [...machines].sort((a, b) =>
    machinesSort === 'kwh' ? b.today_kwh - a.today_kwh : b.current_kw - a.current_kw
  )

  const alertCounts = {
    critical: alerts.filter((a) => a.severity === 'CRITICAL').length,
    warning: alerts.filter((a) => a.severity === 'WARNING').length,
  }

  const tabsWithBadge = OVERVIEW_TABS.map((t) => {
    if (t.key === 'alerts' && alertCounts.critical + alertCounts.warning > 0) {
      return { ...t, badge: alertCounts.critical + alertCounts.warning }
    }
    return t
  })

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Energy Overview"
        actions={
          <button onClick={load} className="btn-secondary text-xs gap-1.5 py-1.5">
            <RefreshCw size={12} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        }
      />

      {/* Filter bar */}
      <div className="px-5 py-2.5 border-b border-surface-800 bg-surface-950/60 flex items-center gap-3 flex-wrap">
        <HierarchySelector showSection compact />
      </div>

      {/* Tabs */}
      <div className="px-5 bg-surface-950/40">
        <TabBar tabs={tabsWithBadge} active={overviewTab} onChange={setOverviewTab} />
      </div>

      {/* Tab content — fixed height, no page scroll */}
      <div className="flex-1 overflow-y-auto">
        {loading && !kpi ? (
          <div className="flex items-center justify-center h-64">
            <LoadingSpinner label="Loading energy data…" size="lg" />
          </div>
        ) : (
          <>
            {/* ── OVERVIEW TAB ─────────────────────────────────────── */}
            {overviewTab === 'overview' && (
              <div className="p-5 space-y-4">
                {/* KPI strip */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <KPICard label="Today's Consumption" value={fmtKwh(kpi?.today_kwh)}
                    sub="Since midnight" icon={<Zap size={13} />} accent="blue" />
                  <KPICard label="Current Demand" value={fmtKw(kpi?.current_demand_kw)}
                    sub="Active power now" icon={<Activity size={13} />} accent="green" />
                  <KPICard label="Peak Demand" value={fmtKw(kpi?.peak_demand_kw)}
                    sub="Today's maximum" icon={<TrendingUp size={13} />} accent="amber" />
                  <KPICard label="Avg Power Factor" value={fmtPf(kpi?.avg_power_factor)}
                    sub="Today's average" icon={<Gauge size={13} />}
                    accent={kpi && kpi.avg_power_factor >= 0.9 ? 'green' : 'amber'} />
                  <KPICard label="This Month" value={fmtKwh(kpi?.current_month_kwh)}
                    trend={mom ?? undefined}
                    sub={`Prev: ${fmtKwh(kpi?.previous_month_kwh)}`}
                    icon={<BarChart2 size={13} />} accent="purple" />
                  <KPICard label="Online Meters" value={`${kpi?.online_meters ?? 0} / ${kpi?.total_meters ?? 0}`}
                    sub={`${kpi?.active_machines ?? 0} machines`} icon={<Wifi size={13} />}
                    accent={kpi && kpi.online_meters === kpi.total_meters ? 'green' : 'amber'} />
                </div>

                {/* Overview 2-column: trend sparkline + section bars */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                  <div className="lg:col-span-3 card">
                    <div className="card-header">
                      <span className="text-sm font-semibold text-surface-200">Energy Trend Today</span>
                      <button
                        onClick={() => setOverviewTab('trend')}
                        className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
                      >
                        Full Trend <ArrowUpRight size={11} />
                      </button>
                    </div>
                    <div className="p-3">
                      <EnergyTrendChart data={trend?.data ?? []} granularity="hourly"
                        loading={trendLoading} height={170} />
                    </div>
                  </div>
                  <div className="lg:col-span-2 card">
                    <div className="card-header">
                      <span className="text-sm font-semibold text-surface-200">Section Ranking</span>
                      <button
                        onClick={() => setOverviewTab('sections')}
                        className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
                      >
                        Detail <ArrowUpRight size={11} />
                      </button>
                    </div>
                    <div className="p-3">
                      {sections.length === 0
                        ? <p className="text-xs text-surface-500 text-center py-8">Waiting for data…</p>
                        : <SectionBarChart data={sections} height={170} />}
                    </div>
                  </div>
                </div>

                {/* Alert summary strip */}
                {alerts.length > 0 && (
                  <div
                    className="card border-l-2 border-l-amber-500 cursor-pointer hover:border-l-amber-400 transition-colors"
                    onClick={() => setOverviewTab('alerts')}
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-surface-200">
                          {alertCounts.critical > 0 && (
                            <span className="text-red-400 mr-2">{alertCounts.critical} Critical</span>
                          )}
                          {alertCounts.warning > 0 && (
                            <span className="text-amber-400 mr-2">{alertCounts.warning} Warning</span>
                          )}
                          alerts active
                        </div>
                        <div className="text-xs text-surface-500 mt-0.5">{alerts[0]?.message}</div>
                      </div>
                      <ArrowUpRight size={14} className="text-surface-600" />
                    </div>
                  </div>
                )}

                {/* Top 5 machines quick view */}
                <div className="card">
                  <div className="card-header">
                    <span className="text-sm font-semibold text-surface-200 flex items-center gap-2">
                      <Cpu size={13} className="text-brand-400" />
                      Top Consuming Machines
                    </span>
                    <button
                      onClick={() => setOverviewTab('machines')}
                      className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
                    >
                      All Machines <ArrowUpRight size={11} />
                    </button>
                  </div>
                  <div className="divide-y divide-surface-800/60">
                    {sortedMachines.slice(0, 5).map((m) => {
                      const live = Object.values(readings).find((r) => r.machine_name === m.machine_name)
                      const kw = live?.active_power_kw ?? m.current_kw
                      const maxKw = 400
                      const pct = Math.min(100, (kw / maxKw) * 100)
                      return (
                        <div
                          key={m.machine_id}
                          className="flex items-center gap-4 px-4 py-2.5 hover:bg-surface-800/40 cursor-pointer transition-colors"
                          onClick={() => openDrawer(m.machine_id)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-surface-200 truncate">{m.machine_name}</span>
                              <StatusBadge status={m.status} size="sm" />
                            </div>
                            <div className="text-[10px] text-surface-500 mt-0.5">{m.shed_name} / {m.section_name}</div>
                          </div>
                          <div className="shrink-0 w-28">
                            <div className="flex items-center justify-between text-[10px] text-surface-500 mb-1">
                              <span>{fmt(kw, 0)} kW</span>
                              <span>{pct.toFixed(0)}%</span>
                            </div>
                            <div className="h-1.5 bg-surface-800 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: pct >= 90 ? '#ef4444' : pct >= 75 ? '#f59e0b' : '#3b82f6',
                                }}
                              />
                            </div>
                          </div>
                          <div className="text-sm font-mono font-medium text-brand-400 shrink-0 w-20 text-right">
                            {fmtKwh(m.today_kwh)}
                          </div>
                          <ArrowUpRight size={13} className="text-surface-700 shrink-0" />
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── TREND TAB ─────────────────────────────────────────── */}
            {overviewTab === 'trend' && (
              <div className="p-5 space-y-4">
                <div className="card">
                  <div className="card-header">
                    <span className="text-sm font-semibold text-surface-200">Energy Consumption Trend</span>
                    <div className="flex items-center gap-1">
                      {GRANULARITY.map((g) => (
                        <button
                          key={g.key}
                          onClick={() => setGranularity(g.key)}
                          className={clsx(
                            'px-2.5 py-1 text-xs rounded transition-colors',
                            g.key === granularity
                              ? 'bg-brand-600 text-white'
                              : 'text-surface-400 hover:text-surface-200 bg-surface-800',
                          )}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="p-4">
                    <EnergyTrendChart
                      data={trend?.data ?? []}
                      granularity={granularity}
                      loading={trendLoading}
                      height={320}
                    />
                  </div>
                </div>

                {/* Trend stats */}
                {trend && trend.data.length > 0 && (
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      {
                        label: 'Total in Period',
                        value: fmtKwh(trend.data.reduce((s, d) => s + d.value, 0)),
                        accent: 'blue' as const,
                      },
                      {
                        label: 'Average per Bucket',
                        value: fmtKwh(trend.data.reduce((s, d) => s + d.value, 0) / trend.data.length),
                        accent: 'green' as const,
                      },
                      {
                        label: 'Peak Bucket',
                        value: fmtKwh(Math.max(...trend.data.map((d) => d.value))),
                        accent: 'amber' as const,
                      },
                      {
                        label: 'Data Points',
                        value: String(trend.data.length),
                        accent: 'purple' as const,
                      },
                    ].map((s) => (
                      <KPICard key={s.label} label={s.label} value={s.value} accent={s.accent} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── SECTIONS TAB ──────────────────────────────────────── */}
            {overviewTab === 'sections' && (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Ranked bar chart */}
                  <div className="card">
                    <div className="card-header">
                      <span className="text-sm font-semibold text-surface-200">Today's Consumption by Section</span>
                    </div>
                    <div className="p-4">
                      <SectionBarChart data={sections} height={280} />
                    </div>
                  </div>

                  {/* Section detail table */}
                  <div className="card">
                    <div className="card-header">
                      <span className="text-sm font-semibold text-surface-200">Section Detail</span>
                    </div>
                    <div className="divide-y divide-surface-800/60">
                      {sections.map((s, i) => (
                        <div key={s.section_id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-800/30 transition-colors">
                          <div className="w-5 h-5 rounded-full bg-surface-800 flex items-center justify-center text-[10px] font-bold text-surface-400 shrink-0">
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-surface-200">{s.section_name}</div>
                            <div className="text-[10px] text-surface-500">{s.shed_name} · {s.meter_count} meters</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-bold font-mono text-brand-400">{fmtKwh(s.today_kwh)}</div>
                            <div className="text-[10px] text-surface-500">{fmtKw(s.current_kw)} now · {s.pct_of_total.toFixed(1)}%</div>
                          </div>
                          <div className="w-16 shrink-0">
                            <div className="h-1.5 bg-surface-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-brand-500 rounded-full"
                                style={{ width: `${s.pct_of_total}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {sections.length === 0 && (
                        <div className="py-10 text-center text-xs text-surface-500">
                          No section data — waiting for simulator readings…
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── MACHINES TAB ──────────────────────────────────────── */}
            {overviewTab === 'machines' && (
              <div className="p-5">
                <div className="card overflow-hidden">
                  <div className="card-header">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-surface-200">Power Matrix</span>
                      <span className="text-xs text-surface-500">— {machines.length} machines</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-surface-500">Sort:</span>
                      {(['kwh', 'kw'] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => setMachinesSort(s)}
                          className={clsx(
                            'px-2 py-0.5 text-xs rounded transition-colors',
                            machinesSort === s ? 'bg-brand-600 text-white' : 'text-surface-400 hover:text-surface-200 bg-surface-800',
                          )}
                        >
                          {s === 'kwh' ? 'Energy' : 'Demand'}
                        </button>
                      ))}
                      <span className="text-xs text-surface-500">Top</span>
                      {[10, 20, 50].map((n) => (
                        <button
                          key={n}
                          onClick={() => setTopN(n)}
                          className={clsx(
                            'px-2 py-0.5 text-xs rounded transition-colors',
                            topN === n ? 'bg-brand-600 text-white' : 'text-surface-400 hover:text-surface-200 bg-surface-800',
                          )}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-surface-800">
                          {['#', 'Machine', 'Location', 'Now kW', 'Load %', 'Today kWh', 'PF', 'Voltage', 'Current', 'Status', ''].map((h) => (
                            <th key={h} className="text-left text-[10px] text-surface-500 font-semibold uppercase tracking-wider px-3 py-2.5">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedMachines.map((m, idx) => {
                          const live = Object.values(readings).find((r) => r.machine_name === m.machine_name)
                          const kw = live?.active_power_kw ?? m.current_kw
                          const pf = live?.power_factor ?? m.power_factor
                          const v = live?.voltage_avg ?? m.voltage_avg
                          const i = live?.current_avg ?? m.current_avg
                          const pct = Math.min(100, (kw / 400) * 100)
                          return (
                            <tr
                              key={m.machine_id}
                              className="border-b border-surface-800/40 hover:bg-surface-800/40 cursor-pointer transition-colors"
                              onClick={() => openDrawer(m.machine_id)}
                            >
                              <td className="px-3 py-2.5 text-[10px] text-surface-600 font-mono w-8">{idx + 1}</td>
                              <td className="px-3 py-2.5">
                                <div className="font-medium text-surface-200 text-sm">{m.machine_name}</div>
                                <div className="text-[10px] text-surface-500 font-mono">{m.meter_identification}</div>
                              </td>
                              <td className="px-3 py-2.5 text-xs text-surface-400 whitespace-nowrap">
                                {m.shed_name} / {m.section_name}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="font-mono font-semibold text-blue-400 text-sm">{fmt(kw, 0)}</span>
                              </td>
                              <td className="px-3 py-2.5 w-24">
                                <div className="flex items-center gap-1.5">
                                  <div className="flex-1 h-1.5 bg-surface-800 rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${pct}%`,
                                        backgroundColor: pct >= 90 ? '#ef4444' : pct >= 75 ? '#f59e0b' : '#3b82f6',
                                      }}
                                    />
                                  </div>
                                  <span className="text-[10px] text-surface-500 w-7 text-right">{pct.toFixed(0)}%</span>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 font-mono text-xs text-surface-300">{fmtKwh(m.today_kwh)}</td>
                              <td className="px-3 py-2.5">
                                <span className={clsx('font-mono text-xs font-medium',
                                  pf && pf >= 0.9 ? 'text-emerald-400' : pf && pf >= 0.85 ? 'text-amber-400' : 'text-red-400'
                                )}>
                                  {pf ? fmt(pf, 3) : '—'}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 font-mono text-xs text-sky-400">{v ? `${fmt(v, 0)} V` : '—'}</td>
                              <td className="px-3 py-2.5 font-mono text-xs text-violet-400">{i ? `${fmt(i, 0)} A` : '—'}</td>
                              <td className="px-3 py-2.5"><StatusBadge status={m.status} size="sm" /></td>
                              <td className="px-3 py-2.5">
                                <ArrowUpRight size={13} className="text-surface-700 hover:text-brand-400 transition-colors" />
                              </td>
                            </tr>
                          )
                        })}
                        {machines.length === 0 && (
                          <tr><td colSpan={11} className="text-center text-xs text-surface-500 py-12">
                            {loading ? 'Loading…' : 'No data yet — simulator will populate in 30s'}
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── ALERTS TAB ────────────────────────────────────────── */}
            {overviewTab === 'alerts' && (
              <div className="p-5 space-y-3">
                <div className="flex items-center gap-3">
                  {[
                    { label: 'Critical', count: alertCounts.critical, cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
                    { label: 'Warning', count: alertCounts.warning, cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
                    { label: 'Total Active', count: alerts.length, cls: 'bg-surface-800 text-surface-300 border-surface-700' },
                  ].map((s) => (
                    <div key={s.label} className={`border rounded-lg px-4 py-2 flex items-center gap-2 ${s.cls}`}>
                      <span className="text-xl font-bold">{s.count}</span>
                      <span className="text-xs">{s.label}</span>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  {alerts.length === 0 ? (
                    <div className="card p-10 text-center">
                      <AlertTriangle size={28} className="mx-auto mb-3 text-surface-600" />
                      <p className="text-sm text-surface-500">No active alerts</p>
                      <p className="text-xs text-surface-600 mt-1">Alert rules will generate notifications as the simulator runs</p>
                    </div>
                  ) : (
                    alerts.map((a) => (
                      <div
                        key={a.id}
                        className={clsx(
                          'card border-l-2 px-4 py-3',
                          a.severity === 'CRITICAL' ? 'border-l-red-500' :
                          a.severity === 'WARNING' ? 'border-l-amber-500' : 'border-l-blue-500',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={clsx(
                                'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                                a.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-400' :
                                a.severity === 'WARNING' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400',
                              )}>
                                {a.severity}
                              </span>
                              <span className="text-[10px] text-surface-500">{a.alert_type.replace(/_/g, ' ')}</span>
                            </div>
                            <div className="text-sm text-surface-200">{a.message}</div>
                            {a.machine_name && (
                              <div className="text-[10px] text-surface-500 mt-1">
                                {a.machine_name} · {a.meter_identification}
                              </div>
                            )}
                          </div>
                          <div className="text-[10px] text-surface-500 whitespace-nowrap shrink-0">
                            {new Date(a.fired_at).toLocaleTimeString('en-IN')}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
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
