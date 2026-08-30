/**
 * SLD — Single Line Diagram (Electrical Distribution)
 *
 * Design:
 *  - No horizontal scroll — fully vertical, responsive
 *  - Dark industrial theme matching EnergyIQ
 *  - Hierarchy: Incomers (top KPI strip) → Main Bus Bar → PDB accordion sections
 *  - Each PDB section expands to show its child machines in a wrap grid
 *  - Click any node → navigate to Meter Detail page (/meter-detail/:meterId)
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/layout/TopBar'
import StatusBadge from '../components/common/StatusBadge'
import { useHierarchy } from '../hooks/useHierarchy'
import { useRealtimeStore } from '../store/realtimeStore'
import { fetchMeters, fetchMachines } from '../api/hierarchy'
import type { EnergyMeter, Machine } from '../types'
import { RefreshCw, ChevronDown, ChevronRight, Zap, Activity, Radio } from 'lucide-react'
import clsx from 'clsx'

// ── Power distribution hierarchy ─────────────────────────────────────────────
const PDB_FEEDS: Record<string, string[]> = {
  'Conductor PDB-01': ['Bunching-02', 'Bunching-03', 'Bunching-06', 'Bunching-07', 'Bunching-08', 'Stranding-09', 'Stranding-10'],
  'Conductor PDB-02': ['MWD-04', 'MWD-06', 'MWD-07', 'MWD-08', 'Bunching-01', 'Bunching-04'],
  'Conductor PDB-03': ['Bunching-05', 'Stranding-05', 'Stranding-06', 'Stranding-07', 'Stranding-08', 'Annealing Furnace'],
  'Armouring PDB':    ['Armouring-1', 'Armouring-2', 'Armouring-3', 'Armouring-4', 'Armouring-5', 'Armouring-7'],
  'Insulation PDB':   ['Extruder-01', 'Extruder-02', 'Extruder-03', 'Extruder-04', 'Extruder-05', 'Extruder-09'],
  'DT & Arm PDB':     ['Drum Twister-1', 'Drum Twister-2', 'Drum Twister-3', 'Drum Twister-4'],
  'Outer PDB':        ['Extruder-06', 'Extruder-07', 'Extruder-08'],
  'Utility PDB':      ['QC Lab / Spar', 'Reprocessing'],
}

const INCOMER_NAMES = [
  'ACB / Solar Panel', 'APFC 1', 'APFC 2', 'DG',
  'Incommer Breaker 1 New', 'Incommer Breaker 2 New',
]
const PDB_NAMES  = Object.keys(PDB_FEEDS)
const RBD_NAMES  = ['RBD-02', 'RBD-05', 'RBD-09', 'RBD-10']

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadColour(pct: number) {
  if (pct >= 90) return '#ef4444'
  if (pct >= 70) return '#f59e0b'
  return '#22c55e'
}
function pfColour(pf?: number) {
  if (pf == null) return '#64748b'
  if (pf >= 0.9)  return '#22c55e'
  if (pf >= 0.85) return '#f59e0b'
  return '#ef4444'
}

// ── Compact meter/machine card ─────────────────────────────────────────────────
function MeterCard({
  name, meter, machine, isIncomer, isPDB, onClick,
}: {
  name: string
  meter?: EnergyMeter
  machine?: Machine
  isIncomer?: boolean
  isPDB?: boolean
  onClick?: () => void
}) {
  const readings = useRealtimeStore(s => s.readings)
  const live     = meter ? readings[meter.id] : undefined
  const kw       = live?.active_power_kw ?? 0
  const pf       = live?.power_factor
  const rated    = machine?.rated_power_kw ?? 400
  const pct      = Math.min(100, rated > 0 ? (kw / rated) * 100 : 0)
  const col      = live ? loadColour(pct) : '#64748b'
  const accent   = isIncomer ? '#8b5cf6' : isPDB ? '#3b82f6' : col

  return (
    <button
      onClick={onClick}
      className="group flex flex-col gap-1.5 p-3 rounded-xl border text-left w-full
                 transition-all hover:scale-[1.02] active:scale-[0.99]"
      style={{ borderColor: `${accent}30`, backgroundColor: `${accent}08` }}
    >
      {/* Top row: status dot + name */}
      <div className="flex items-start gap-1.5">
        <span className="w-2 h-2 rounded-full mt-0.5 shrink-0" style={{ backgroundColor: col }} />
        <span className="text-[10px] font-semibold text-surface-100 leading-tight line-clamp-2 flex-1">
          {name}
        </span>
      </div>

      {/* PF */}
      <div className="text-[11px] font-bold tabular-nums" style={{ color: pfColour(pf) }}>
        PF {pf != null ? pf.toFixed(2) : '—'}
      </div>

      {/* kW */}
      <div className="flex items-center gap-1">
        <Radio size={9} style={{ color: col }} />
        <span className="text-[11px] font-bold font-mono tabular-nums" style={{ color: col }}>
          {kw.toFixed(1)} kW
        </span>
      </div>

      {/* Load bar */}
      <div className="w-full h-1 rounded-full bg-surface-700 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: col }} />
      </div>

      {/* Meter ID */}
      {meter && (
        <div className="text-[8px] font-mono text-surface-600 truncate">{meter.identification}</div>
      )}
    </button>
  )
}

// ── PDB accordion section ─────────────────────────────────────────────────────
function PDBSection({
  pdbName, pdbMeter, pdbMachine, childNames, meterByName, machineByName, onNodeClick,
}: {
  pdbName: string
  pdbMeter?: EnergyMeter
  pdbMachine?: Machine
  childNames: string[]
  meterByName: Record<string, EnergyMeter>
  machineByName: Record<string, Machine>
  onNodeClick: (meter: EnergyMeter) => void
}) {
  const [open, setOpen] = useState(true)
  const readings = useRealtimeStore(s => s.readings)

  const totalKw    = childNames.reduce((s, n) => {
    const m = meterByName[n]
    return s + (m ? (readings[m.id]?.active_power_kw ?? 0) : 0)
  }, 0)
  const pdbKw      = pdbMeter ? (readings[pdbMeter.id]?.active_power_kw ?? 0) : 0
  const onlineCount = childNames.filter(n => meterByName[n] && readings[meterByName[n].id]).length

  return (
    <div className="card overflow-hidden">
      {/* PDB header — click to expand/collapse */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-800/40 transition-colors"
      >
        {/* Collapse icon */}
        {open
          ? <ChevronDown size={14} className="text-surface-500 shrink-0" />
          : <ChevronRight size={14} className="text-surface-500 shrink-0" />
        }

        {/* Vertical bar accent */}
        <div className="w-1 h-8 rounded-full bg-brand-500 shrink-0" />

        {/* PDB info */}
        <div className="flex-1 text-left min-w-0">
          <div className="text-sm font-semibold text-surface-100">{pdbName}</div>
          <div className="text-[10px] text-surface-500">
            {pdbMeter?.identification ?? 'No meter'} · {childNames.length} machines
          </div>
        </div>

        {/* PDB live stats */}
        <div className="flex items-center gap-4 shrink-0 text-right">
          <div>
            <div className="text-sm font-bold font-mono text-blue-400">{pdbKw.toFixed(1)} kW</div>
            <div className="text-[9px] text-surface-500">PDB load</div>
          </div>
          <div>
            <div className="text-sm font-bold font-mono text-brand-400">{totalKw.toFixed(1)} kW</div>
            <div className="text-[9px] text-surface-500">child total</div>
          </div>
          <div>
            <div className="text-sm font-bold font-mono text-emerald-400">{onlineCount}/{childNames.length}</div>
            <div className="text-[9px] text-surface-500">online</div>
          </div>
        </div>

        {/* Clickable PDB node */}
        <div onClick={e => { e.stopPropagation(); if (pdbMeter) onNodeClick(pdbMeter) }}
          className="shrink-0 ml-2">
          <MeterCard
            name={pdbName}
            meter={pdbMeter}
            machine={pdbMachine}
            isPDB
          />
        </div>
      </button>

      {/* Connection line */}
      {open && (
        <div className="flex flex-col items-center py-0">
          <div className="w-px h-3 bg-surface-600" />
          <div className="w-full h-px bg-surface-700 mx-6" />
        </div>
      )}

      {/* Child machine grid */}
      {open && (
        <div className="px-4 pb-4 pt-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
            {childNames.map(childName => {
              const m = meterByName[childName]
              return (
                <div key={childName} className="flex flex-col items-center gap-0">
                  <div className="w-px h-3 bg-surface-700" />
                  <MeterCard
                    name={childName}
                    meter={m}
                    machine={machineByName[childName]}
                    onClick={() => m && onNodeClick(m)}
                  />
                </div>
              )
            })}
            {childNames.length === 0 && (
              <div className="col-span-full text-center py-4 text-xs text-surface-500">No machines assigned</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SLDPage() {
  const { selectedPlantId, plants } = useHierarchy()
  const navigate  = useNavigate()
  const readings  = useRealtimeStore(s => s.readings)

  const [meters,   setMeters]   = useState<EnergyMeter[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [loading,  setLoading]  = useState(false)

  const totalKw     = Object.values(readings).reduce((s, r) => s + (r.active_power_kw ?? 0), 0)
  const onlineCount = Object.keys(readings).length
  const plantName   = plants.find(p => p.id === selectedPlantId)?.name ?? 'Plant'

  const loadData = useCallback(() => {
    if (!selectedPlantId) return
    setLoading(true)
    Promise.all([
      fetchMeters({ plant_id: selectedPlantId }),
      fetchMachines({ plant_id: selectedPlantId }),
    ]).then(([ms, machs]) => {
      setMeters(ms)
      setMachines(machs)
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedPlantId])

  useEffect(() => { loadData() }, [loadData])

  // Lookup tables: keyed by machine name (as stored in meter.machine_name)
  const meterByName   = Object.fromEntries(meters.map(m => [m.machine_name ?? m.identification, m]))
  const machineByName = Object.fromEntries(machines.map(m => [m.name, m]))

  // Click any node → navigate to meter detail
  const handleNodeClick = useCallback((meter: EnergyMeter) => {
    navigate(`/meter-detail/${meter.id}`)
  }, [navigate])

  // Build display lists
  const incomerNodes  = INCOMER_NAMES.filter(n => machineByName[n])
  const pdbNodes      = PDB_NAMES.filter(n => machineByName[n])
  const rbdNodes      = RBD_NAMES.filter(n => machineByName[n])
  const assignedNames = new Set([
    ...INCOMER_NAMES, ...PDB_NAMES,
    ...Object.values(PDB_FEEDS).flat(),
    ...RBD_NAMES,
  ])
  const unassigned = machines.filter(m => !assignedNames.has(m.name)).map(m => m.name)

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="SLD Diagram"
        subtitle={`${plantName} — Electrical Power Distribution`}
        actions={
          <button onClick={loadData} className="btn-secondary text-xs gap-1.5 py-1.5">
            <RefreshCw size={12} /> Refresh
          </button>
        }
      />

      {/* ── Summary KPI strip ───────────────────────────────────────────── */}
      <div className="px-5 py-3 border-b border-surface-800 bg-surface-950/60">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Load',    value: `${totalKw.toFixed(0)} kW`, colour: 'text-blue-400' },
            { label: 'Online Meters', value: `${onlineCount} / ${meters.filter(m => m.enabled).length}`, colour: 'text-emerald-400' },
            { label: 'PDB Sections',  value: String(pdbNodes.length),    colour: 'text-brand-400' },
            { label: 'Plant',         value: plantName,                   colour: 'text-amber-400' },
          ].map(k => (
            <div key={k.label} className="card px-3 py-2.5">
              <div className="text-[9px] text-surface-500 uppercase tracking-wider">{k.label}</div>
              <div className={clsx('text-sm font-bold font-mono mt-0.5', k.colour)}>{k.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Legend ──────────────────────────────────────────────────────── */}
      <div className="px-5 py-2 border-b border-surface-800 flex flex-wrap items-center gap-4 text-[10px] text-surface-500">
        {[
          { col: '#8b5cf6', label: 'Incomer / Supply' },
          { col: '#3b82f6', label: 'Distribution PDB' },
          { col: '#22c55e', label: 'Normal load (<70%)' },
          { col: '#f59e0b', label: 'High load (70–90%)' },
          { col: '#ef4444', label: 'Critical / Offline' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: l.col }} />
            {l.label}
          </div>
        ))}
        <span className="ml-auto text-surface-600 text-[9px]">Click any card to open meter detail</span>
      </div>

      {/* ── Main scrollable content ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-surface-400">Building diagram…</p>
            </div>
          </div>
        ) : (
          <div className="p-4 lg:p-6 space-y-5 max-w-7xl mx-auto">

            {/* ── LEVEL 0: INCOMERS ──────────────────────────────────── */}
            {incomerNodes.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Zap size={13} className="text-purple-400" />
                  <span className="text-xs font-semibold text-surface-300 uppercase tracking-wider">
                    Main Supply — Incomers
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 mb-3">
                  {incomerNodes.map(name => {
                    const m = meterByName[name]
                    return (
                      <MeterCard
                        key={name}
                        name={name}
                        meter={m}
                        machine={machineByName[name]}
                        isIncomer
                        onClick={() => m && handleNodeClick(m)}
                      />
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── MAIN BUS BAR ─────────────────────────────────────────── */}
            <div className="relative flex items-center py-1">
              <div className="flex-1 h-4 rounded bg-gradient-to-r from-brand-800 via-brand-600 to-brand-800
                border border-brand-500/40 shadow-md shadow-brand-900/40 flex items-center justify-center">
                <span className="text-[9px] font-bold text-brand-200 tracking-widest uppercase">
                  MAIN BUS BAR — 415 V
                </span>
              </div>
            </div>

            {/* Down arrow from bus */}
            <div className="flex justify-center -mt-3 -mb-1">
              <svg width="12" height="20" viewBox="0 0 12 20" fill="none">
                <line x1="6" y1="0" x2="6" y2="13" stroke="#475569" strokeWidth="2"/>
                <polygon points="6,20 2,13 10,13" fill="#475569"/>
              </svg>
            </div>

            {/* ── LEVEL 1+2: PDB ACCORDION SECTIONS ───────────────────── */}
            {pdbNodes.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Activity size={13} className="text-brand-400" />
                  <span className="text-xs font-semibold text-surface-300 uppercase tracking-wider">
                    Distribution Boards & Loads
                  </span>
                </div>
                <div className="space-y-3">
                  {pdbNodes.map(pdbName => {
                    const childNames = (PDB_FEEDS[pdbName] ?? []).filter(n => machineByName[n])
                    return (
                      <PDBSection
                        key={pdbName}
                        pdbName={pdbName}
                        pdbMeter={meterByName[pdbName]}
                        pdbMachine={machineByName[pdbName]}
                        childNames={childNames}
                        meterByName={meterByName}
                        machineByName={machineByName}
                        onNodeClick={handleNodeClick}
                      />
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── RBD DIRECT ───────────────────────────────────────────── */}
            {rbdNodes.length > 0 && (
              <div className="card overflow-hidden">
                <div className="card-header">
                  <span className="text-sm font-semibold text-surface-200">RBD — Direct to Bus</span>
                  <span className="text-xs text-surface-500">{rbdNodes.length} machines</span>
                </div>
                <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {rbdNodes.map(name => {
                    const m = meterByName[name]
                    return (
                      <MeterCard
                        key={name}
                        name={name}
                        meter={m}
                        machine={machineByName[name]}
                        onClick={() => m && handleNodeClick(m)}
                      />
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── UNASSIGNED ────────────────────────────────────────────── */}
            {unassigned.length > 0 && (
              <div className="card overflow-hidden">
                <div className="card-header">
                  <span className="text-sm font-semibold text-surface-200">Other Loads</span>
                  <span className="text-xs text-surface-500">{unassigned.length} machines</span>
                </div>
                <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {unassigned.map(name => {
                    const m = meterByName[name]
                    return (
                      <MeterCard
                        key={name}
                        name={name}
                        meter={m}
                        machine={machineByName[name]}
                        onClick={() => m && handleNodeClick(m)}
                      />
                    )
                  })}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
