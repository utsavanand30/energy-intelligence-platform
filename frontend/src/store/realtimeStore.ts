import { create } from 'zustand'
import type { RealtimeReading } from '../types'

interface RealtimeState {
  // meter_id → latest reading
  readings: Record<number, RealtimeReading>
  connected: boolean
  lastUpdate: string | null
  setReading: (r: RealtimeReading) => void
  setBatch: (readings: RealtimeReading[]) => void
  setConnected: (v: boolean) => void
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  readings: {},
  connected: false,
  lastUpdate: null,
  setReading: (r) =>
    set((state) => ({
      readings: { ...state.readings, [r.meter_id]: r },
      lastUpdate: r.timestamp,
    })),
  setBatch: (readings) =>
    set((state) => {
      const next = { ...state.readings }
      let ts = state.lastUpdate
      for (const r of readings) {
        next[r.meter_id] = r
        ts = r.timestamp
      }
      return { readings: next, lastUpdate: ts }
    }),
  setConnected: (connected) => set({ connected }),
}))
