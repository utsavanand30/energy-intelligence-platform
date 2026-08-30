/**
 * SLD — Single Line Diagram (Electrical Distribution)
 *
 * Dark industrial UI (original EnergyIQ design language).
 * Content: correct power distribution hierarchy based on reference screenshots.
 *
 * Tree structure:
 *   Level 0 : Incomers / Main supply panels (ACB, APFC, DG, Incommer Breakers)
 *             connected via a horizontal 415V bus bar
 *   Level 1 : PDB distribution boards hanging off the bus with arrows
 *             (Conductor PDB-01/02/03, Armouring PDB, Insulation PDB, etc.)
 *   Level 2 : Machines/loads fanning out from each PDB
 *
 * Clicking any node opens the Machine Detail Drawer (same as Energy Hub).
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import TopBar from '../components/layout/TopBar'
import MachineDrawer from '../components/machines/MachineDrawer'
import { useHierarchy } from '../hooks/useHierarchy'
import { useRealtimeStore } from '../store/realtimeStore'
import { useNavigationStore } from '../store/navigationStore'
import { fetchMeters, fetchMachines } from '../api/hierarchy'
import type { EnergyMeter, Machine } from '../types'
import { ZoomIn, ZoomOut, RefreshCw, Radio } from 'lucide-react'
import clsx from 'clsx'

// ── Correct power distribution hierarchy ─────────────────────────────────────
// Maps each PDB (distribution board) to the machines it feeds.
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

// Level-0: Main supply / incomer nodes
const INCOMER_NAMES = [
  'ACB / Solar Panel',
  'APFC 1',
  'APFC 2',
  'DG',
  'Incommer Breaker 1 New',
  'Incommer Breaker 2 New',
]

const PDB_NAMES = Object.keys(PDB_FEEDS)

// ── Colour helpers ────────────────────────────────────────────────────────────
function loadColour(pct: number): string {
  if (pct >= 90) return '#ef4444'
  if (pct >= 70) return '#f59e0b'
  return '#22c55e'
}
function statusColour(status: string): string {
  switch (status) {
    case 'ONLINE':  return '#22c55e'
    case 'WARNING': return '#f59e0b'
    case 'OFFLINE': return '#ef4444'
    default:        return '#64748b'
  }
}
function pfColour(pf: number | undefined): string {
  if (pf == null) return '#64748b'
  if (pf >= 0.9)  return '#22c55e'
  if (pf >= 0.85) return '#f59e0b'
  return '#ef4444'
}

// ── Node card — dark theme ────────────────────────────────────────────────────
interface NodeCardProps {
  name: string
  meter?: EnergyMeter
  machine?: Machine
  isIncomer?: boolean
  isPDB?: boolean
  onClick?: () => void
}

function NodeCard({ name, meter, machine, isIncomer, isPDB, onClick }: NodeCardProps) {
  const readings = useRealtimeStore(s => s.readings)
  const live      = meter ? readings[meter.id] : undefined
  const kw        = live?.active_power_kw ?? 0
  const pf        = live?.power_factor
  const rated     = machine?.rated_power_kw ?? 400
  const pct       = Math.min(100, rated > 0 ? (kw / rated) * 100 : 0)
  const nodeColour = live ? loadColour(pct) : (meter ? statusColour(meter.communication_status) : '#64748b')

  // Card accent colour based on type
  const accentHue = isIncomer ? '#8b5cf6' : isPDB ? '#3b82f6' : nodeColour

  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-start text-left rounded-xl border transition-all
                 hover:scale-105 active:scale-100 select-none p-3 gap-1.5 min-w-[120px] max-w-[150px]"
      style={{
        borderColor: `${accentHue}35`,
        backgroundColor: `${accentHue}08`,
        boxShadow: live ? `0 0 10px ${nodeColour}18` : 'none',
      }}
    >
      {/* Status dot + name */}
      <div className="flex items-start gap-1.5 w-full">
        <div
          className="w-2 h-2 rounded-full shrink-0 mt-0.5"
          style={{ backgroundColor: nodeColour }}
        />
        <div className="text-[10px] font-semibold text-surface-100 leading-tight line-clamp-2 flex-1">
          {name}
        </div>
      </div>

      {/* PF */}
      <div className="text-[11px] font-bold" style={{ color: pfColour(pf) }}>
        PF {pf != null ? pf.toFixed(2) : '—'}
      </div>

      {/* kW */}
      <div className="flex items-center gap-1">
        <Radio size={9} style={{ color: nodeColour }} />
        <span className="text-[11px] font-bold font-mono" style={{ color: nodeColour }}>
          {kw.toFixed(2)} kW
        </span>
      </div>

      {/* Load bar */}
      <div className="w-full h-1 bg-surface-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: nodeColour }}
        />
      </div>

      {/* Meter ID */}
      {meter && (
        <div className="text-[8px] font-mono text-surface-500 truncate w-full">
          {meter.identification}
        </div>
      )}
    </button>
  )
}

// ── Connector arrows ──────────────────────────────────────────────────────────
function DownArrow({ height = 28, colour = '#334155' }: { height?: number; colour?: string }) {
  return (
    <svg width="10" height={height} viewBox={`0 0 10 ${height}`} fill="none" className="mx-auto shrink-0">
      <line x1="5" y1="0" x2="5" y2={height - 7} stroke={colour} strokeWidth="1.5" />
      <polygon points={`5,${height} 2,${height - 7} 8,${height - 7}`} fill={colour} />
    </svg>
  )
}

// ── Main Bus Bar ──────────────────────────────────────────────────────────────
function MainBus({ label }: { label: string }) {
  return (
    <div className="w-full h-4 rounded bg-gradient-to-r from-brand-800 via-brand-600 to-brand-800
      border border-brand-500/40 shadow-lg shadow-brand-900/50 flex items-center justify-center">
      <span className="text-[9px] font-bold text-brand-200 tracking-widest uppercase">{label}</span>
    </div>
  )
}

// ── RBD standalone section (not under any PDB) ────────────────────────────────
const RBD_NAMES = ['RBD-02', 'RBD-05', 'RBD-09', 'RBD-10']

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SLDPage() {
  const { selectedPlantId, plants } = useHierarchy()
  const { openDrawer } = useNavigationStore()
  const readings = useRealtimeStore(s => s.readings)

  const [meters,   setMeters]   = useState<EnergyMeter[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [loading,  setLoading]  = useState(false)
  const [zoom,     setZoom]     = useState(1)

  const totalKw      = Object.values(readings).reduce((s, r) => s + (r.active_power_kw ?? 0), 0)
  const onlineCount  = Object.keys(readings).length
  const plantName    = plants.find(p => p.id === selectedPlantId)?.name ?? 'Plant'

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

  // Lookup tables
  const meterByMachineName = Object.fromEntries(meters.map(m => [m.machine_name ?? '', m]))
  const machineByName      = Object.fromEntries(machines.map(m => [m.name, m]))

  // Node click → open machine detail drawer
  const handleClick = useCallback((machineName: string) => {
    const machine = machineByName[machineName]
    if (machine) openDrawer(machine.id)
  }, [machineByName, openDrawer])

  // Build tree levels
  const incomerNodes = INCOMER_NAMES.filter(n => machineByName[n])
  const pdbNodes     = PDB_NAMES.filter(n => machineByName[n])
  const rbdNodes     = RBD_NAMES.filter(n => machineByName[n])

  const assignedNames = new Set([
    ...INCOMER_NAMES, ...PDB_NAMES,
    ...Object.values(PDB_FEEDS).flat(),
    ...RBD_NAMES,
  ])
  const unassigned = machines
    .filter(m => !assignedNames.has(m.name))
    .map(m => m.name)

  const zoomIn    = () => setZoom(z => Math.min(1.6, +(z + 0.1).toFixed(1)))
  const zoomOut   = () => setZoom(z => Math.max(0.4, +(z - 0.1).toFixed(1)))
  const zoomReset = () => setZoom(1)

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="SLD Diagram"
        subtitle={`${plantName} — Electrical Distribution`}
        actions={
          <div className="flex items-center gap-1">
            <button onClick={zoomOut}   className="p-1.5 rounded hover:bg-surface-800 text-surface-400 hover:text-white transition-colors"><ZoomOut  size={14} /></button>
            <span className="text-[10px] text-surface-400 w-10 text-center font-mono">{Math.round(zoom * 100)}%</span>
            <button onClick={zoomIn}    className="p-1.5 rounded hover:bg-surface-800 text-surface-400 hover:text-white transition-colors"><ZoomIn   size={14} /></button>
            <button onClick={zoomReset} className="px-2 py-1 text-[10px] rounded hover:bg-surface-800 text-surface-400 hover:text-white transition-colors">Reset</button>
            <button onClick={loadData}  className="p-1.5 rounded hover:bg-surface-800 text-surface-400 hover:text-white transition-colors"><RefreshCw size={14} /></button>
          </div>
        }
      />

      {/* ── Legend + summary strip ──────────────────────────────────────── */}
      <div className="px-5 py-2.5 border-b border-surface-800 bg-surface-950/60 flex flex-wrap items-center gap-5 text-[10px]">
        {/* Type legend */}
        <div className="flex items-center gap-4">
          {[
            { colour: '#8b5cf6', label: 'Incomer / Supply' },
            { colour: '#3b82f6', label: 'Distribution PDB' },
            { colour: '#22c55e', label: 'Machine (normal)' },
            { colour: '#f59e0b', label: 'Machine (high load)' },
            { colour: '#ef4444', label: 'Critical / Offline' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5 text-surface-400">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: l.colour }} />
              {l.label}
            </div>
          ))}
        </div>
        {/* Live totals */}
        <div className="ml-auto flex items-center gap-4 text-surface-400">
          <span><span className="text-emerald-400 font-bold font-mono">{onlineCount}</span> online</span>
          <span><span className="text-blue-400 font-bold font-mono">{totalKw.toFixed(0)} kW</span> total load</span>
        </div>
      </div>

      {/* ── Scrollable canvas ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto bg-surface-950">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-surface-400">Building diagram…</p>
            </div>
          </div>
        ) : (
          <div
            className="p-8 min-w-max origin-top-left"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
          >

            {/* ─── LEVEL 0: INCOMER nodes + main bus ───────────────────── */}
            <div className="flex flex-col items-center">

              {/* Incomer row */}
              <div className="flex items-end gap-5 justify-center flex-wrap">
                {incomerNodes.map(name => (
                  <div key={name} className="flex flex-col items-center">
                    <NodeCard
                      name={name}
                      meter={meterByMachineName[name]}
                      machine={machineByName[name]}
                      isIncomer
                      onClick={() => handleClick(name)}
                    />
                    <DownArrow height={24} colour="#475569" />
                  </div>
                ))}
              </div>

              {/* Main 415V bus bar */}
              <div className="w-full max-w-6xl mt-0">
                <MainBus label="MAIN BUS BAR — 415 V" />
              </div>
            </div>

            {/* ─── LEVEL 1 → LEVEL 2: PDB groups ──────────────────────── */}
            <div className="flex flex-wrap gap-10 justify-start mt-1">

              {pdbNodes.map(pdbName => {
                const childNames = (PDB_FEEDS[pdbName] ?? []).filter(n => machineByName[n])
                const pdbMeter   = meterByMachineName[pdbName]
                const pdbMachine = machineByName[pdbName]
                const pdbKw      = pdbMeter ? (readings[pdbMeter.id]?.active_power_kw ?? 0) : 0

                return (
                  <div key={pdbName} className="flex flex-col items-center">

                    {/* Wire from bus down to PDB */}
                    <DownArrow height={32} colour="#1d4ed8" />

                    {/* PDB card */}
                    <NodeCard
                      name={pdbName}
                      meter={pdbMeter}
                      machine={pdbMachine}
                      isPDB
                      onClick={() => handleClick(pdbName)}
                    />

                    {/* Children */}
                    {childNames.length > 0 && (
                      <div className="flex flex-col items-center w-full">
                        {/* Vertical stub */}
                        <div className="w-px h-4 bg-surface-600" />

                        {/* Horizontal distribution rail */}
                        <div className="relative w-full h-px bg-surface-600">
                          {/* Tick marks above each child position */}
                        </div>

                        {/* Child cards */}
                        <div className="flex flex-wrap gap-2.5 justify-center pt-0">
                          {childNames.map(childName => (
                            <div key={childName} className="flex flex-col items-center">
                              <DownArrow height={20} colour="#334155" />
                              <NodeCard
                                name={childName}
                                meter={meterByMachineName[childName]}
                                machine={machineByName[childName]}
                                onClick={() => handleClick(childName)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* ── RBD section (direct to bus, no PDB parent) ─────────── */}
              {rbdNodes.length > 0 && (
                <div className="flex flex-col items-center">
                  <DownArrow height={32} colour="#475569" />
                  <div className="text-[9px] text-surface-500 font-semibold mb-2 uppercase tracking-wider">
                    RBD (Direct)
                  </div>
                  <div className="flex flex-wrap gap-2.5 justify-center">
                    {rbdNodes.map(name => (
                      <div key={name} className="flex flex-col items-center">
                        <NodeCard
                          name={name}
                          meter={meterByMachineName[name]}
                          machine={machineByName[name]}
                          onClick={() => handleClick(name)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Unassigned machines ────────────────────────────────── */}
              {unassigned.length > 0 && (
                <div className="flex flex-col items-center">
                  <DownArrow height={32} colour="#475569" />
                  <div className="text-[9px] text-surface-500 font-semibold mb-2 uppercase tracking-wider">
                    Other Loads
                  </div>
                  <div className="flex flex-wrap gap-2.5 justify-center">
                    {unassigned.map(name => (
                      <div key={name} className="flex flex-col items-center">
                        <NodeCard
                          name={name}
                          meter={meterByMachineName[name]}
                          machine={machineByName[name]}
                          onClick={() => handleClick(name)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Footer ──────────────────────────────────────────────────── */}
            <div className="mt-10 text-[9px] text-surface-700 text-center">
              Click any node to open machine detail · Data updates every 30 seconds
            </div>
          </div>
        )}
      </div>

      {/* Machine detail drawer (same as Energy Hub) */}
      <MachineDrawer />
    </div>
  )
}
