import { useState, useEffect, useCallback } from 'react'
import TopBar from '../components/layout/TopBar'
import HierarchySelector from '../components/common/HierarchySelector'
import TabBar from '../components/common/TabBar'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { useHierarchyStore } from '../store/hierarchyStore'
import { useHierarchy } from '../hooks/useHierarchy'
import { fetchDailyReport } from '../api/energy'
import type { DailyReportRow } from '../types'
import { fmtKwh, fmtKw, fmtPf } from '../utils/formatters'
import { FileText, Download, RefreshCw, Plus, X, GripVertical, Check, BarChart3, Settings } from 'lucide-react'
import clsx from 'clsx'

const REPORT_TABS = [
  { key: 'daily', label: 'Daily Report', icon: <FileText size={13} /> },
  { key: 'builder', label: 'Report Builder', icon: <Settings size={13} /> },
  { key: 'saved', label: 'Saved Reports', icon: <BarChart3 size={13} /> },
]

// All available report columns
const ALL_COLUMNS = [
  { key: 'date', label: 'Date', group: 'Time', required: true },
  { key: 'shed_name', label: 'Shed', group: 'Location' },
  { key: 'section_name', label: 'Section', group: 'Location' },
  { key: 'machine_name', label: 'Machine', group: 'Location' },
  { key: 'meter_identification', label: 'Meter ID', group: 'Meter' },
  { key: 'opening_kwh', label: 'Opening kWh', group: 'Energy' },
  { key: 'closing_kwh', label: 'Closing kWh', group: 'Energy' },
  { key: 'consumption_kwh', label: 'Consumption kWh', group: 'Energy', required: true },
  { key: 'avg_kw', label: 'Average kW', group: 'Power' },
  { key: 'peak_kw', label: 'Peak kW', group: 'Power' },
  { key: 'avg_pf', label: 'Average PF', group: 'Power' },
]

// Pre-built report templates
const TEMPLATES = [
  {
    id: 'summary',
    name: 'Daily Summary',
    description: 'Essential consumption data per machine',
    columns: ['date', 'section_name', 'machine_name', 'consumption_kwh', 'avg_kw', 'avg_pf'],
    icon: '📊',
  },
  {
    id: 'detailed',
    name: 'Detailed Energy',
    description: 'Full energy register data with opening/closing',
    columns: ['date', 'shed_name', 'section_name', 'machine_name', 'meter_identification', 'opening_kwh', 'closing_kwh', 'consumption_kwh'],
    icon: '📋',
  },
  {
    id: 'pf_audit',
    name: 'Power Factor Audit',
    description: 'Focus on power quality metrics',
    columns: ['date', 'machine_name', 'section_name', 'consumption_kwh', 'avg_kw', 'peak_kw', 'avg_pf'],
    icon: '⚡',
  },
  {
    id: 'meter',
    name: 'Meter Register',
    description: 'Meter-level register readings',
    columns: ['date', 'meter_identification', 'machine_name', 'opening_kwh', 'closing_kwh', 'consumption_kwh'],
    icon: '🔌',
  },
]

function todayStr() { return new Date().toISOString().split('T')[0] }
function nDaysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function formatCell(row: DailyReportRow, key: string): string {
  switch (key) {
    case 'date': return row.date
    case 'shed_name': return row.shed_name
    case 'section_name': return row.section_name
    case 'machine_name': return row.machine_name
    case 'meter_identification': return row.meter_identification
    case 'opening_kwh': return row.opening_kwh.toFixed(2)
    case 'closing_kwh': return row.closing_kwh.toFixed(2)
    case 'consumption_kwh': return fmtKwh(row.consumption_kwh)
    case 'avg_kw': return `${row.avg_kw.toFixed(1)} kW`
    case 'peak_kw': return `${row.peak_kw.toFixed(1)} kW`
    case 'avg_pf': return row.avg_pf.toFixed(3)
    default: return '—'
  }
}

function cellClass(key: string): string {
  switch (key) {
    case 'consumption_kwh': return 'text-brand-400 font-bold font-mono'
    case 'avg_kw':
    case 'peak_kw': return 'text-blue-400 font-mono'
    case 'avg_pf': return 'font-mono'
    case 'opening_kwh':
    case 'closing_kwh': return 'font-mono text-surface-400'
    case 'date': return 'font-mono text-surface-400'
    default: return 'text-surface-300'
  }
}

function pfClass(pf: number): string {
  if (pf >= 0.9) return 'text-emerald-400'
  if (pf >= 0.85) return 'text-amber-400'
  return 'text-red-400'
}

export default function Reports() {
  const { selectedPlantId, selectedShedId, selectedSectionId } = useHierarchyStore()
  useHierarchy() // ensures plant auto-select fires on direct navigation to this page
  const [activeTab, setActiveTab] = useState('daily')
  const [rows, setRows] = useState<DailyReportRow[]>([])
  const [fromDate, setFromDate] = useState(nDaysAgo(6))
  const [toDate, setToDate] = useState(todayStr())
  const [loading, setLoading] = useState(false)

  // Report builder state
  const [activeColumns, setActiveColumns] = useState<string[]>(
    ['date', 'section_name', 'machine_name', 'consumption_kwh', 'avg_kw', 'avg_pf']
  )
  const [savedReports, setSavedReports] = useState<{ id: string; name: string; columns: string[]; createdAt: string }[]>([])
  const [saveName, setSaveName] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const load = useCallback(async () => {
    if (!selectedPlantId) return
    setLoading(true)
    try {
      const data = await fetchDailyReport({
        plant_id: selectedPlantId,
        ...(selectedShedId ? { shed_id: selectedShedId } : {}),
        ...(selectedSectionId ? { section_id: selectedSectionId } : {}),
        from_date: fromDate,
        to_date: toDate,
      })
      setRows(data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [selectedPlantId, selectedShedId, selectedSectionId, fromDate, toDate])

  useEffect(() => {
    if (activeTab === 'daily' && selectedPlantId) load()
  }, [activeTab, selectedPlantId, selectedShedId, selectedSectionId, fromDate, toDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const exportCsv = (cols: string[]) => {
    const headers = cols.map((k) => ALL_COLUMNS.find((c) => c.key === k)?.label ?? k)
    const csvRows = [
      headers.join(','),
      ...rows.map((r) => cols.map((k) => formatCell(r, k).replace(',', ';')).join(',')),
    ]
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `energy_report_${fromDate}_${toDate}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const toggleColumn = (key: string) => {
    const col = ALL_COLUMNS.find((c) => c.key === key)
    if (col?.required) return
    setActiveColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  const applyTemplate = (cols: string[]) => {
    setActiveColumns(cols)
    setActiveTab('daily')
    load()
  }

  const saveReport = () => {
    if (!saveName.trim()) return
    setSavedReports((prev) => [...prev, {
      id: Date.now().toString(),
      name: saveName,
      columns: [...activeColumns],
      createdAt: new Date().toLocaleDateString(),
    }])
    setSaveName('')
    setShowSaveDialog(false)
  }

  // Drag-to-reorder columns
  const handleDragStart = (idx: number) => setDragIdx(idx)
  const handleDrop = (idx: number) => {
    if (dragIdx === null || dragIdx === idx) return
    const next = [...activeColumns]
    const [item] = next.splice(dragIdx, 1)
    next.splice(idx, 0, item)
    setActiveColumns(next)
    setDragIdx(null)
  }

  // Group rows by section for daily report
  const bySection: Record<string, DailyReportRow[]> = {}
  for (const r of rows) {
    const key = r.section_name
    if (!bySection[key]) bySection[key] = []
    bySection[key].push(r)
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Energy Reports" />

      <div className="px-5 py-2.5 border-b border-surface-800 bg-surface-950/60 flex items-center gap-3 flex-wrap">
        <HierarchySelector showSection compact />
        <div className="flex items-center gap-2 ml-auto">
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] text-surface-500 uppercase tracking-wider font-medium">From</label>
            <input type="date" className="input-field text-xs py-1.5"
              value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] text-surface-500 uppercase tracking-wider font-medium">To</label>
            <input type="date" className="input-field text-xs py-1.5"
              value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <button onClick={load} className="btn-secondary text-xs gap-1.5 py-1.5 mt-4">
            <RefreshCw size={12} /> Generate
          </button>
          <button onClick={() => exportCsv(activeColumns)} disabled={rows.length === 0}
            className="btn-secondary text-xs gap-1.5 py-1.5 mt-4 disabled:opacity-40">
            <Download size={12} /> CSV
          </button>
        </div>
      </div>

      <div className="px-5 bg-surface-950/40">
        <TabBar tabs={REPORT_TABS} active={activeTab} onChange={setActiveTab} size="sm" />
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── DAILY REPORT ─────────────────────────────────────── */}
        {activeTab === 'daily' && (
          <div className="p-5">
            {loading ? (
              <div className="flex justify-center py-16"><LoadingSpinner label="Generating report…" /></div>
            ) : rows.length === 0 ? (
              <div className="card p-12 text-center">
                <FileText size={32} className="mx-auto mb-3 text-surface-600" />
                <p className="text-sm text-surface-400">No data for selected period</p>
                <p className="text-xs text-surface-600 mt-1">
                  Run <code className="bg-surface-800 px-1 rounded">python -m app.seed.historical_seed</code> to generate 7 days of history
                </p>
              </div>
            ) : (
              <div className="card overflow-hidden">
                <div className="card-header">
                  <div>
                    <span className="text-sm font-semibold text-surface-200">
                      {fromDate} → {toDate}
                    </span>
                    <span className="text-xs text-surface-500 ml-2">· {rows.length} rows · {activeColumns.length} columns</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowSaveDialog(true)}
                      className="btn-secondary text-xs gap-1.5 py-1">
                      <Plus size={11} /> Save Template
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-surface-800">
                        {activeColumns.map((key) => {
                          const col = ALL_COLUMNS.find((c) => c.key === key)
                          return (
                            <th key={key}
                              className="text-left text-[10px] text-surface-500 font-semibold uppercase tracking-wider px-3 py-2.5 whitespace-nowrap">
                              {col?.label ?? key}
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(bySection).flatMap(([sectionName, sectionRows]) => [
                        // Section header row
                        <tr key={`section-${sectionName}`} className="bg-surface-800/40">
                          <td colSpan={activeColumns.length} className="px-3 py-1.5 text-xs font-semibold text-brand-400">
                            ▸ {sectionName}
                          </td>
                        </tr>,
                        // Data rows
                        ...sectionRows.map((row, i) => (
                          <tr key={`${row.date}-${row.meter_identification}`}
                            className="border-b border-surface-800/30 hover:bg-surface-800/30 transition-colors">
                            {activeColumns.map((key) => (
                              <td key={key} className={clsx(
                                'px-3 py-2 text-xs whitespace-nowrap',
                                key === 'avg_pf' ? pfClass(row.avg_pf) : cellClass(key)
                              )}>
                                {formatCell(row, key)}
                              </td>
                            ))}
                          </tr>
                        )),
                        // Section subtotal
                        <tr key={`subtotal-${sectionName}`} className="border-b border-surface-700 bg-surface-800/20">
                          {activeColumns.map((key) => (
                            <td key={key} className="px-3 py-1.5 text-xs font-bold">
                              {key === 'section_name' ? <span className="text-surface-400">{sectionName} total</span>
                               : key === 'consumption_kwh' ? <span className="text-brand-300 font-mono">{fmtKwh(sectionRows.reduce((s, r) => s + r.consumption_kwh, 0))}</span>
                               : key === 'avg_kw' ? <span className="text-blue-300 font-mono">{(sectionRows.reduce((s, r) => s + r.avg_kw, 0) / sectionRows.length).toFixed(1)}</span>
                               : ''}
                            </td>
                          ))}
                        </tr>,
                      ])}
                    </tbody>
                    {/* Grand total */}
                    <tfoot>
                      <tr className="bg-surface-800/60 border-t border-surface-700">
                        {activeColumns.map((key) => (
                          <td key={key} className="px-3 py-2 text-xs font-bold">
                            {key === 'machine_name' ? <span className="text-surface-300">TOTAL</span>
                             : key === 'consumption_kwh' ? <span className="text-brand-300 font-mono text-sm">{fmtKwh(rows.reduce((s, r) => s + r.consumption_kwh, 0))}</span>
                             : ''}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── REPORT BUILDER ────────────────────────────────────── */}
        {activeTab === 'builder' && (
          <div className="p-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Left: Column selector */}
              <div className="space-y-4">
                <div className="card">
                  <div className="card-header">
                    <span className="text-sm font-semibold text-surface-200">Available Columns</span>
                    <span className="text-xs text-surface-500">Click to add / remove</span>
                  </div>
                  <div className="p-3 space-y-3">
                    {['Time', 'Location', 'Meter', 'Energy', 'Power'].map((group) => (
                      <div key={group}>
                        <div className="text-[9px] text-surface-600 uppercase tracking-widest font-bold mb-1.5">{group}</div>
                        <div className="space-y-1">
                          {ALL_COLUMNS.filter((c) => c.group === group).map((col) => {
                            const isActive = activeColumns.includes(col.key)
                            return (
                              <button
                                key={col.key}
                                onClick={() => toggleColumn(col.key)}
                                disabled={col.required}
                                className={clsx(
                                  'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all',
                                  isActive
                                    ? 'bg-brand-600/20 text-brand-300 border border-brand-600/30'
                                    : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800',
                                  col.required && 'opacity-60 cursor-not-allowed',
                                )}
                              >
                                <span>{col.label}</span>
                                {isActive && <Check size={11} className="text-brand-400" />}
                                {col.required && <span className="text-[9px] text-surface-600">required</span>}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Middle: Active columns (drag to reorder) */}
              <div className="space-y-4">
                <div className="card">
                  <div className="card-header">
                    <span className="text-sm font-semibold text-surface-200">Active Columns</span>
                    <span className="text-xs text-surface-500">Drag to reorder</span>
                  </div>
                  <div className="p-3 space-y-1.5">
                    {activeColumns.map((key, idx) => {
                      const col = ALL_COLUMNS.find((c) => c.key === key)
                      return (
                        <div
                          key={key}
                          draggable
                          onDragStart={() => handleDragStart(idx)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => handleDrop(idx)}
                          className={clsx(
                            'flex items-center gap-2 px-3 py-2.5 rounded-lg bg-surface-800 border transition-all cursor-grab active:cursor-grabbing',
                            dragIdx === idx ? 'border-brand-500 opacity-50' : 'border-surface-700 hover:border-surface-600',
                          )}
                        >
                          <GripVertical size={13} className="text-surface-600 shrink-0" />
                          <span className="flex-1 text-sm text-surface-200">{col?.label ?? key}</span>
                          <span className="text-[9px] text-surface-600 bg-surface-900 px-1.5 py-0.5 rounded">{col?.group}</span>
                          {!col?.required && (
                            <button
                              onClick={() => toggleColumn(key)}
                              className="text-surface-600 hover:text-red-400 transition-colors"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      )
                    })}
                    {activeColumns.length === 0 && (
                      <div className="py-8 text-center text-xs text-surface-500">
                        Add columns from the left panel
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => { setActiveTab('daily'); load() }}
                  className="btn-primary w-full justify-center text-sm py-2.5"
                >
                  <BarChart3 size={14} />
                  Generate Report
                </button>
              </div>

              {/* Right: Templates */}
              <div className="space-y-4">
                <div className="card">
                  <div className="card-header">
                    <span className="text-sm font-semibold text-surface-200">Templates</span>
                  </div>
                  <div className="p-3 space-y-2">
                    {TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => applyTemplate(t.columns)}
                        className="w-full text-left p-3 rounded-lg bg-surface-800 hover:bg-surface-700 border border-surface-700 hover:border-surface-600 transition-all group"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-base">{t.icon}</span>
                          <span className="text-sm font-medium text-surface-200 group-hover:text-white transition-colors">
                            {t.name}
                          </span>
                        </div>
                        <div className="text-[10px] text-surface-500">{t.description}</div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {t.columns.map((c) => (
                            <span key={c} className="text-[9px] bg-surface-900 text-surface-400 px-1.5 py-0.5 rounded">
                              {ALL_COLUMNS.find((col) => col.key === c)?.label ?? c}
                            </span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SAVED REPORTS ─────────────────────────────────────── */}
        {activeTab === 'saved' && (
          <div className="p-5">
            {savedReports.length === 0 ? (
              <div className="card p-12 text-center">
                <BarChart3 size={32} className="mx-auto mb-3 text-surface-600" />
                <p className="text-sm text-surface-400">No saved report templates yet</p>
                <p className="text-xs text-surface-600 mt-1">
                  Go to Report Builder → Generate Report → Save Template
                </p>
                <button
                  onClick={() => setActiveTab('builder')}
                  className="btn-primary mt-4 text-sm"
                >
                  Open Report Builder
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {savedReports.map((r) => (
                  <div key={r.id} className="card p-4 hover:border-surface-700 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div className="text-sm font-semibold text-surface-200">{r.name}</div>
                      <button
                        onClick={() => setSavedReports((prev) => prev.filter((x) => x.id !== r.id))}
                        className="text-surface-600 hover:text-red-400 transition-colors"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <div className="text-[10px] text-surface-500 mb-3">Created {r.createdAt} · {r.columns.length} columns</div>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {r.columns.map((c) => (
                        <span key={c} className="text-[9px] bg-surface-800 text-surface-400 px-1.5 py-0.5 rounded">
                          {ALL_COLUMNS.find((col) => col.key === c)?.label ?? c}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        setActiveColumns(r.columns)
                        setActiveTab('daily')
                        load()
                      }}
                      className="btn-primary w-full text-xs py-2 justify-center"
                    >
                      Run Report
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Save dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-surface-900 border border-surface-700 rounded-xl p-6 w-80 shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-3">Save Report Template</h3>
            <p className="text-xs text-surface-500 mb-4">
              Saving {activeColumns.length} columns: {activeColumns.map((k) => ALL_COLUMNS.find((c) => c.key === k)?.label).join(', ')}
            </p>
            <input
              className="input-field w-full mb-4"
              placeholder="Template name…"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveReport()}
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={saveReport} className="btn-primary flex-1 text-sm justify-center">Save</button>
              <button onClick={() => setShowSaveDialog(false)} className="btn-secondary flex-1 text-sm justify-center">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
