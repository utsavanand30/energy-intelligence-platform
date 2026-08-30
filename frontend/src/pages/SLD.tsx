/**
 * SLD — Single Line Diagram (Electrical Distribution)
 *
 * Matches the reference Polycab MOS style:
 *   - White/light card nodes with dark text
 *   - Blue PF value, black kW with bar-chart icon
 *   - True top-down tree:
 *       Level 0 : Incomers / Main panels (connected via horizontal bus bar)
 *       Level 1 : PDB nodes (distribution boards) — hanging off bus with arrows
 *       Level 2 : Machines / load nodes — fanning out from each PDB
 *   - Canvas is scrollable both X and Y
 *   - Zoom in/out controls
 *   - Clicking any node opens the meter detail view
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/layout/TopBar'
import { useHierarchy } from '../hooks/useHierarchy'
import { useRealtimeStore } from '../store/realtimeStore'
import { fetchMeters, fetchMachines } from '../api/hierarchy'
import type { EnergyMeter, Machine } from '../types'
import { ZoomIn, ZoomOut, RefreshCw, Maximize2 } from 'lucide-react'
import clsx from 'clsx'

// ── Colour helpers ───────────────────────────────────────────────────────────
function pfColour(pf: number | undefined): string {
  if (!pf) return '#94a3b8'
  if (pf >= 0.9) return '#2563eb'   // blue — good
  if (pf >= 0.85) return '#d97706'  // amber — warning
  return '#dc2626'                   // red — bad
}
function kwColour(pct: number): string {
  if (pct >= 90) return '#dc2626'
  if (pct >= 70) return '#d97706'
  return '#16a34a'
}

// ── Known PDB → machines mapping ─────────────────────────────────────────────
// This maps each PDB node (machine name in DB) to the machines it feeds.
// PDB nodes appear as Level-1 nodes; their downstream loads appear at Level-2.
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

// Incomer nodes (Level-0, connected directly to the main bus)
const INCOMER_NAMES = [
  'ACB / Solar Panel',
  'APFC 1',
  'APFC 2',
  'DG',
  'Incommer Breaker 1 New',
  'Incommer Breaker 2 New',
]

// Nodes that are PDBs but shown at Level-1
const PDB_NAMES = Object.keys(PDB_FEEDS)

// ── Node card component ───────────────────────────────────────────────────────
interface NodeCardProps {
  name: string
  meter?: EnergyMeter
  isIncomer?: boolean
  isPDB?: boolean
  onClick?: () => void
}

function NodeCard({ name, meter, isIncomer, isPDB, onClick }: NodeCardProps) {
  const readings = useRealtimeStore(s => s.readings)
  const live = meter ? readings[meter.id] : undefined
  const kw = live?.active_power_kw ?? 0
  const pf = live?.power_factor
  const rated = 400
  const pct = Math.min(100, (kw / rated) * 100)

  const cardBg = isIncomer
    ? 'bg-slate-50 border-slate-200'
    : isPDB
      ? 'bg-blue-50 border-blue-200'
      : 'bg-white border-gray-200'

  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex flex-col items-start text-left rounded-lg border-2 shadow-sm',
        'transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]',
        'min-w-[130px] max-w-[160px] p-2.5 gap-1 select-none',
        cardBg,
      )}
    >
      {/* Machine name */}
      <div className="text-[10px] font-bold text-gray-800 leading-tight line-clamp-2 w-full">
        {name}
      </div>

      {/* PF */}
      <div
        className="text-[11px] font-semibold"
        style={{ color: pfColour(pf) }}
      >
        PF {pf != null ? pf.toFixed(2) : '—'}
      </div>

      {/* kW with bar icon */}
      <div className="flex items-center gap-1 mt-0.5">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <rect x="0" y="7" width="2.5" height="5" rx="0.5" fill={live ? kwColour(pct) : '#94a3b8'} />
          <rect x="3.5" y="4" width="2.5" height="8" rx="0.5" fill={live ? kwColour(pct) : '#94a3b8'} />
          <rect x="7" y="1" width="2.5" height="11" rx="0.5" fill={live ? kwColour(pct) : '#94a3b8'} />
        </svg>
        <span
          className="text-[11px] font-semibold"
          style={{ color: live ? kwColour(pct) : '#6b7280' }}
        >
          {kw.toFixed(2)} kW
        </span>
      </div>

      {/* Load bar */}
      {live && (
        <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden mt-0.5">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, backgroundColor: kwColour(pct) }}
          />
        </div>
      )}
    </button>
  )
}

// ── Arrow / connector lines ───────────────────────────────────────────────────
function DownArrow({ height = 32 }: { height?: number }) {
  return (
    <svg width="10" height={height} viewBox={`0 0 10 ${height}`} fill="none"
      className="mx-auto shrink-0">
      <line x1="5" y1="0" x2="5" y2={height - 7} stroke="#94a3b8" strokeWidth="1.5" />
      <polygon points={`5,${height} 2,${height - 7} 8,${height - 7}`} fill="#94a3b8" />
    </svg>
  )
}

function HorizontalBus({ label }: { label: string }) {
  return (
    <div className="relative w-full flex items-center">
      <div className="flex-1 h-3 bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600
        rounded-sm border border-blue-400/60 shadow-md shadow-blue-900/20
        flex items-center justify-center">
        <span className="text-[9px] font-bold text-white tracking-widest uppercase">{label}</span>
      </div>
    </div>
  )
}

// ── Main SLD component ────────────────────────────────────────────────────────
export default function SLDPage() {
  const { selectedPlantId, plants } = useHierarchy()
  const navigate = useNavigate()
  const readings = useRealtimeStore(s => s.readings)

  const [meters, setMeters] = useState<EnergyMeter[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [loading, setLoading] = useState(false)
  const [zoom, setZoom] = useState(1)

  const canvasRef = useRef<HTMLDivElement>(null)

  const totalKw = Object.values(readings).reduce((s, r) => s + (r.active_power_kw ?? 0), 0)

  // Load data
  useEffect(() => {
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

  // Build lookup tables
  const meterByMachineName = Object.fromEntries(
    meters.map(m => [m.machine_name ?? '', m])
  )
  const machineByName = Object.fromEntries(
    machines.map(m => [m.name, m])
  )

  // ── Node click handler → go to meter detail ────────────────────────────────
  const handleNodeClick = useCallback((machineName: string) => {
    const meter = meterByMachineName[machineName]
    if (meter) {
      navigate(`/meter-detail/${meter.id}`)
    }
  }, [meterByMachineName, navigate])

  // ── Build tree levels ──────────────────────────────────────────────────────
  // Level 0: Incomers that exist in our machine list
  const incomerNodes = INCOMER_NAMES.filter(n => machineByName[n])

  // Level 1: PDB nodes
  const pdbNodes = PDB_NAMES.filter(n => machineByName[n])

  // Level 2: Per PDB, the child machines
  // Also collect "direct" machines not assigned to any PDB (RBD-02 etc.)
  const assignedToSomePDB = new Set(Object.values(PDB_FEEDS).flat())
  const directMachines = machines
    .filter(m =>
      !INCOMER_NAMES.includes(m.name) &&
      !PDB_NAMES.includes(m.name) &&
      !assignedToSomePDB.has(m.name)
    )
    .map(m => m.name)

  // Zoom helpers
  const zoomIn  = () => setZoom(z => Math.min(1.5, +(z + 0.1).toFixed(1)))
  const zoomOut = () => setZoom(z => Math.max(0.4, +(z - 0.1).toFixed(1)))
  const zoomReset = () => setZoom(1)

  const plantName = plants.find(p => p.id === selectedPlantId)?.name ?? 'Plant'

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="Electrical SLD"
        subtitle={`${plantName} — Single Line Diagram`}
        actions={
          <div className="flex items-center gap-1">
            <button onClick={zoomOut}  className="p-1.5 rounded hover:bg-surface-800 text-surface-400 hover:text-white transition-colors"><ZoomOut  size={14} /></button>
            <span className="text-xs text-surface-400 w-10 text-center font-mono">{Math.round(zoom * 100)}%</span>
            <button onClick={zoomIn}   className="p-1.5 rounded hover:bg-surface-800 text-surface-400 hover:text-white transition-colors"><ZoomIn   size={14} /></button>
            <button onClick={zoomReset} className="p-1.5 rounded hover:bg-surface-800 text-surface-400 hover:text-white transition-colors text-[10px] font-medium">Reset</button>
            <button
              onClick={() => { if (selectedPlantId) { setLoading(true); Promise.all([fetchMeters({ plant_id: selectedPlantId }), fetchMachines({ plant_id: selectedPlantId })]).then(([ms, machs]) => { setMeters(ms); setMachines(machs) }).finally(() => setLoading(false)) } }}
              className="p-1.5 rounded hover:bg-surface-800 text-surface-400 hover:text-white transition-colors"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        }
      />

      {/* Legend bar */}
      <div className="px-5 py-2 border-b border-surface-800 bg-surface-950/60 flex flex-wrap items-center gap-6 text-[10px] text-surface-400">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded border-2 border-slate-300 bg-slate-50" />
          <span>Incomer / Supply</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded border-2 border-blue-300 bg-blue-50" />
          <span>Distribution Board (PDB)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded border-2 border-gray-300 bg-white" />
          <span>Machine / Load</span>
        </div>
        <div className="flex items-center gap-4 ml-auto">
          <span className="flex items-center gap-1"><span className="text-blue-600 font-bold">PF</span> = Power Factor</span>
          <span className="flex items-center gap-1">
            <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0" y="5" width="2" height="5" fill="#16a34a" /><rect x="3" y="3" width="2" height="7" fill="#16a34a" /><rect x="6" y="0" width="2" height="10" fill="#16a34a" /></svg>
            = Load kW
          </span>
          <span className="font-mono font-bold text-emerald-400">{totalKw.toFixed(0)} kW total</span>
        </div>
      </div>

      {/* ── Main canvas — scrollable, zoomable ─────────────────────────────── */}
      <div className="flex-1 overflow-auto bg-gray-100" ref={canvasRef}>
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center text-gray-500">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm">Building diagram…</p>
            </div>
          </div>
        ) : (
          <div
            className="origin-top-left p-8 min-w-max"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
          >

            {/* ── LEVEL 0: INCOMERS connected via main bus ──────────────── */}
            <div className="flex flex-col items-center gap-0 mb-0">

              {/* Incomer cards in a row */}
              <div className="flex items-end gap-4 justify-center flex-wrap">
                {incomerNodes.map(name => (
                  <div key={name} className="flex flex-col items-center">
                    <NodeCard
                      name={name}
                      meter={meterByMachineName[name]}
                      isIncomer
                      onClick={() => handleNodeClick(name)}
                    />
                    <DownArrow height={28} />
                  </div>
                ))}
              </div>

              {/* Main 415V Bus Bar */}
              <div className="w-full max-w-5xl px-4">
                <HorizontalBus label="MAIN BUS BAR — 415 V" />
              </div>
            </div>

            {/* ── LEVEL 1: PDB NODES ─────────────────────────────────────── */}
            {/* Each PDB hangs off the bus with a connector, then fans to machines */}
            <div className="flex flex-wrap gap-12 justify-start pt-0 mt-2">
              {pdbNodes.map(pdbName => {
                const childNames = (PDB_FEEDS[pdbName] ?? []).filter(n => machineByName[n])
                const pdbMeter = meterByMachineName[pdbName]

                return (
                  <div key={pdbName} className="flex flex-col items-center min-w-[140px]">
                    {/* Down arrow from bus to PDB */}
                    <DownArrow height={36} />

                    {/* PDB card */}
                    <NodeCard
                      name={pdbName}
                      meter={pdbMeter}
                      isPDB
                      onClick={() => handleNodeClick(pdbName)}
                    />

                    {/* Distribution to children */}
                    {childNames.length > 0 && (
                      <div className="flex flex-col items-center w-full">
                        {/* Vertical drop from PDB */}
                        <div className="w-px h-5 bg-gray-400" />

                        {/* Horizontal distribution bar */}
                        <div className="relative flex items-center w-full">
                          <div className="flex-1 h-px bg-gray-400" />
                        </div>

                        {/* Child machine cards */}
                        <div className="flex flex-wrap gap-3 justify-center mt-0 pt-0">
                          {childNames.map(childName => (
                            <div key={childName} className="flex flex-col items-center">
                              <DownArrow height={24} />
                              <NodeCard
                                name={childName}
                                meter={meterByMachineName[childName]}
                                onClick={() => handleNodeClick(childName)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Direct machines (no PDB parent) */}
              {directMachines.length > 0 && (
                <div className="flex flex-col items-center">
                  <DownArrow height={36} />
                  <div className="text-[9px] text-gray-500 font-semibold mb-2 uppercase tracking-wider">Direct Loads</div>
                  <div className="flex flex-wrap gap-3">
                    {directMachines.map(name => (
                      <div key={name} className="flex flex-col items-center">
                        <NodeCard
                          name={name}
                          meter={meterByMachineName[name]}
                          onClick={() => handleNodeClick(name)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Footer note ──────────────────────────────────────────────── */}
            <div className="mt-12 text-[9px] text-gray-400 text-center">
              Click any node to view detailed meter parameters · Data updates every 30 seconds
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
