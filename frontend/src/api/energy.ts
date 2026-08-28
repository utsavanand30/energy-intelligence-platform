import api from './client'
import type {
  EnergyKPI, EnergyTrend, SectionConsumption, MachineConsumption,
  Alert, MetricsSummary, MeterReading, DailyReportRow, MeterHealth, EnergyMeter
} from '../types'

// ── Energy KPI ────────────────────────────────────────────────────────
export const fetchEnergyOverview = (params: {
  plant_id: number
  shed_id?: number
  section_id?: number
}) => api.get<EnergyKPI>('/energy/overview', { params }).then((r) => r.data)

// ── Trend ─────────────────────────────────────────────────────────────
export const fetchEnergyTrend = (params: {
  plant_id: number
  shed_id?: number
  section_id?: number
  granularity?: string
  from_dt?: string
  to_dt?: string
}) => api.get<EnergyTrend>('/energy/trend', { params }).then((r) => r.data)

// ── Section breakdown ─────────────────────────────────────────────────
export const fetchSectionBreakdown = (params: {
  plant_id: number
  shed_id?: number
}) => api.get<SectionConsumption[]>('/energy/section-breakdown', { params }).then((r) => r.data)

// ── Machine breakdown ─────────────────────────────────────────────────
export const fetchMachineBreakdown = (params: {
  plant_id: number
  shed_id?: number
  section_id?: number
  top_n?: number
}) => api.get<MachineConsumption[]>('/energy/machine-breakdown', { params }).then((r) => r.data)

// ── Alerts ────────────────────────────────────────────────────────────
export const fetchAlerts = (params?: { plant_id?: number; severity?: string }) =>
  api.get<Alert[]>('/alerts', { params }).then((r) => r.data)

export const acknowledgeAlert = (id: number) =>
  api.patch(`/alerts/${id}/acknowledge`).then((r) => r.data)

// ── Metrics ───────────────────────────────────────────────────────────
export const fetchMetricsSummary = (params: {
  meter_id?: number
  machine_id?: number
  from_dt?: string
  to_dt?: string
}) => api.get<MetricsSummary>('/metrics/summary', { params }).then((r) => r.data)

export const fetchMetricsReadings = (params: {
  meter_id?: number
  machine_id?: number
  from_dt?: string
  to_dt?: string
  granularity?: string
  limit?: number
}) => api.get<MeterReading[]>('/metrics/readings', { params }).then((r) => r.data)

// ── Meter health ──────────────────────────────────────────────────────
export const fetchMeterHealth = (params?: { plant_id?: number }) =>
  api.get<MeterHealth[]>('/meters/health', { params }).then((r) => r.data)

export const fetchMeters = (params?: {
  plant_id?: number
  shed_id?: number
  section_id?: number
  machine_id?: number
}) => api.get<EnergyMeter[]>('/meters', { params }).then((r) => r.data)

export const fetchMeterLatest = (meterId: number) =>
  api.get<MeterReading | null>(`/meters/${meterId}/latest`).then((r) => r.data)

// ── Reports ───────────────────────────────────────────────────────────
export const fetchDailyReport = (params: {
  plant_id: number
  shed_id?: number
  section_id?: number
  from_date?: string
  to_date?: string
}) => api.get<DailyReportRow[]>('/reports/daily', { params }).then((r) => r.data)
