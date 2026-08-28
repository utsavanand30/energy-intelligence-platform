import type { MeterStatus } from '../types'

export function statusColor(status: MeterStatus | string): string {
  switch (status) {
    case 'ONLINE':   return '#22c55e'
    case 'WARNING':  return '#f59e0b'
    case 'OFFLINE':  return '#ef4444'
    case 'DISABLED': return '#64748b'
    default:         return '#64748b'
  }
}

export function pfColor(pf: number | undefined | null): string {
  if (pf == null) return '#64748b'
  if (pf >= 0.90) return '#22c55e'
  if (pf >= 0.85) return '#f59e0b'
  return '#ef4444'
}

export function loadColor(loadPct: number): string {
  if (loadPct >= 90) return '#ef4444'
  if (loadPct >= 75) return '#f59e0b'
  return '#3b82f6'
}

// ECharts-friendly colour palette
export const CHART_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316',
]
