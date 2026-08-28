import { useHierarchy } from '../../hooks/useHierarchy'
import { useNavigationStore } from '../../store/navigationStore'
import { ChevronDown, Loader2 } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  showSection?: boolean
  showMachine?: boolean
  compact?: boolean
}

function SelectField({
  label,
  value,
  onChange,
  disabled,
  loading,
  options,
  placeholder,
  compact,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  loading?: boolean
  options: { id: number; name: string }[]
  placeholder: string
  compact?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] text-surface-500 uppercase tracking-wider font-medium px-0.5">
        {label}
      </label>
      <div className="relative">
        <select
          className={clsx(
            'select-field appearance-none pr-7',
            compact ? 'min-w-[110px] text-xs py-1.5' : 'min-w-[140px]',
            disabled && 'opacity-40 cursor-not-allowed',
          )}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || loading}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
          {loading
            ? <Loader2 size={11} className="text-surface-500 animate-spin" />
            : <ChevronDown size={11} className="text-surface-500" />
          }
        </div>
      </div>
    </div>
  )
}

export default function HierarchySelector({ showSection = true, showMachine = false, compact = false }: Props) {
  const store = useHierarchy()
  const { pushBreadcrumb } = useNavigationStore()

  const {
    plants, sheds, sections, machines,
    selectedPlantId, selectedShedId, selectedSectionId, selectedMachineId,
    loadingSheds, loadingSections, loadingMachines,
    selectPlant, selectShed, selectSection, selectMachine,
  } = store

  const handlePlant = (v: string) => {
    const id = v ? Number(v) : null
    selectPlant(id)
    if (id) {
      const p = plants.find((x) => x.id === id)
      if (p) pushBreadcrumb({ level: 'plant', id, label: p.name })
    } else {
      useNavigationStore.getState().clearBreadcrumb()
    }
  }

  const handleShed = (v: string) => {
    const id = v ? Number(v) : null
    selectShed(id)
    if (id) {
      const s = sheds.find((x) => x.id === id)
      if (s) pushBreadcrumb({ level: 'shed', id, label: s.name })
    } else {
      useNavigationStore.getState().popToLevel('plant')
    }
  }

  const handleSection = (v: string) => {
    const id = v ? Number(v) : null
    selectSection(id)
    if (id) {
      const s = sections.find((x) => x.id === id)
      if (s) pushBreadcrumb({ level: 'section', id, label: s.name })
    } else {
      useNavigationStore.getState().popToLevel('shed')
    }
  }

  const handleMachine = (v: string) => {
    const id = v ? Number(v) : null
    selectMachine(id)
    if (id) {
      const m = machines.find((x) => x.id === id)
      if (m) pushBreadcrumb({ level: 'machine', id, label: m.name })
    } else {
      useNavigationStore.getState().popToLevel('section')
    }
  }

  return (
    <div className="flex items-end gap-2 flex-wrap">
      <SelectField
        label="Plant"
        value={selectedPlantId?.toString() ?? ''}
        onChange={handlePlant}
        options={plants}
        placeholder="All Plants"
        compact={compact}
      />
      <SelectField
        label="Shed"
        value={selectedShedId?.toString() ?? ''}
        onChange={handleShed}
        disabled={!selectedPlantId}
        loading={loadingSheds}
        options={sheds}
        placeholder="All Sheds"
        compact={compact}
      />
      {showSection && (
        <SelectField
          label="Section"
          value={selectedSectionId?.toString() ?? ''}
          onChange={handleSection}
          disabled={!selectedShedId}
          loading={loadingSections}
          options={sections}
          placeholder="All Sections"
          compact={compact}
        />
      )}
      {showMachine && (
        <SelectField
          label="Machine"
          value={selectedMachineId?.toString() ?? ''}
          onChange={handleMachine}
          disabled={!selectedSectionId}
          loading={loadingMachines}
          options={machines}
          placeholder="All Machines"
          compact={compact}
        />
      )}
    </div>
  )
}
