import { create } from 'zustand'
import type { Plant, Shed, Section, Machine } from '../types'

interface HierarchyState {
  plants: Plant[]
  sheds: Shed[]
  sections: Section[]
  machines: Machine[]

  selectedPlantId: number | null
  selectedShedId: number | null
  selectedSectionId: number | null
  selectedMachineId: number | null

  // Loading flags per level
  loadingSheds: boolean
  loadingSections: boolean
  loadingMachines: boolean

  setPlants: (p: Plant[]) => void
  setSheds: (s: Shed[]) => void
  setSections: (s: Section[]) => void
  setMachines: (m: Machine[]) => void

  setLoadingSheds: (v: boolean) => void
  setLoadingSections: (v: boolean) => void
  setLoadingMachines: (v: boolean) => void

  selectPlant: (id: number | null) => void
  selectShed: (id: number | null) => void
  selectSection: (id: number | null) => void
  selectMachine: (id: number | null) => void

  // Derived helpers
  selectedPlant: () => Plant | undefined
  selectedShed: () => Shed | undefined
  selectedSection: () => Section | undefined
  selectedMachine: () => Machine | undefined
}

export const useHierarchyStore = create<HierarchyState>((set, get) => ({
  plants: [],
  sheds: [],
  sections: [],
  machines: [],

  selectedPlantId: null,
  selectedShedId: null,
  selectedSectionId: null,
  selectedMachineId: null,

  loadingSheds: false,
  loadingSections: false,
  loadingMachines: false,

  setPlants: (plants) => set({ plants }),
  setSheds: (sheds) => set({ sheds }),
  setSections: (sections) => set({ sections }),
  setMachines: (machines) => set({ machines }),

  setLoadingSheds: (v) => set({ loadingSheds: v }),
  setLoadingSections: (v) => set({ loadingSections: v }),
  setLoadingMachines: (v) => set({ loadingMachines: v }),

  // Cascade: selecting a plant clears everything below it
  selectPlant: (id) => set({
    selectedPlantId: id,
    selectedShedId: null,
    selectedSectionId: null,
    selectedMachineId: null,
    sheds: [],
    sections: [],
    machines: [],
  }),

  // Cascade: selecting a shed clears section + machine
  selectShed: (id) => set({
    selectedShedId: id,
    selectedSectionId: null,
    selectedMachineId: null,
    sections: [],
    machines: [],
  }),

  // Cascade: selecting a section clears machine
  selectSection: (id) => set({
    selectedSectionId: id,
    selectedMachineId: null,
    machines: [],
  }),

  selectMachine: (id) => set({ selectedMachineId: id }),

  // Derived
  selectedPlant: () => get().plants.find((p) => p.id === get().selectedPlantId),
  selectedShed: () => get().sheds.find((s) => s.id === get().selectedShedId),
  selectedSection: () => get().sections.find((s) => s.id === get().selectedSectionId),
  selectedMachine: () => get().machines.find((m) => m.id === get().selectedMachineId),
}))
