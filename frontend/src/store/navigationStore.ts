/**
 * Global navigation state — tracks the current drill-down path
 * and the active "sub-tab" within each page.
 *
 * Breadcrumb path:  Plant → Shed → Section → Machine
 * Each level is optional; the user drills down progressively.
 */
import { create } from 'zustand'

export type DrillLevel = 'plant' | 'shed' | 'section' | 'machine'

export interface BreadcrumbItem {
  level: DrillLevel
  id: number
  label: string
}

interface NavigationState {
  // Breadcrumb trail — ordered from plant down to whatever the user navigated to
  breadcrumb: BreadcrumbItem[]

  // Active tab keys per page — persisted across page switches
  overviewTab: string
  hubTab: string
  metricsTab: string
  analyticsTab: string

  // Machine detail drawer
  drawerMachineId: number | null
  drawerOpen: boolean

  // Actions
  pushBreadcrumb: (item: BreadcrumbItem) => void
  popToLevel: (level: DrillLevel) => void
  clearBreadcrumb: () => void

  setOverviewTab: (t: string) => void
  setHubTab: (t: string) => void
  setMetricsTab: (t: string) => void
  setAnalyticsTab: (t: string) => void

  openDrawer: (machineId: number) => void
  closeDrawer: () => void
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  breadcrumb: [],
  overviewTab: 'overview',
  hubTab: 'realtime',
  metricsTab: 'electrical',
  analyticsTab: 'consumption',
  drawerMachineId: null,
  drawerOpen: false,

  pushBreadcrumb: (item) => {
    const existing = get().breadcrumb
    // Remove everything after this level, then push
    const levelOrder: DrillLevel[] = ['plant', 'shed', 'section', 'machine']
    const idx = levelOrder.indexOf(item.level)
    const trimmed = existing.filter((b) => levelOrder.indexOf(b.level) < idx)
    set({ breadcrumb: [...trimmed, item] })
  },

  popToLevel: (level) => {
    const levelOrder: DrillLevel[] = ['plant', 'shed', 'section', 'machine']
    const idx = levelOrder.indexOf(level)
    set({ breadcrumb: get().breadcrumb.filter((b) => levelOrder.indexOf(b.level) <= idx) })
  },

  clearBreadcrumb: () => set({ breadcrumb: [] }),

  setOverviewTab: (t) => set({ overviewTab: t }),
  setHubTab: (t) => set({ hubTab: t }),
  setMetricsTab: (t) => set({ metricsTab: t }),
  setAnalyticsTab: (t) => set({ analyticsTab: t }),

  openDrawer: (machineId) => set({ drawerMachineId: machineId, drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false, drawerMachineId: null }),
}))
