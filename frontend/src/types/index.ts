// ── Hierarchy ──────────────────────────────────────────────────────────

export interface Plant {
  id: number
  name: string
  location?: string
  description?: string
  active: boolean
  created_at?: string
}

export interface Shed {
  id: number
  plant_id: number
  name: string
  active: boolean
  created_at?: string
}

export interface Section {
  id: number
  shed_id: number
  name: string
  active: boolean
  created_at?: string
}

export interface Machine {
  id: number
  section_id: number
  name: string
  machine_type?: string
  rated_power_kw?: number
  active: boolean
  created_at?: string
  section_name?: string
  shed_name?: string
  plant_name?: string
}

// ── Meters ────────────────────────────────────────────────────────────

export type MeterStatus = 'ONLINE' | 'WARNING' | 'OFFLINE' | 'DISABLED'
export type CommProtocol = 'MODBUS_RTU' | 'MODBUS_TCP' | 'SIMULATED'

export interface EnergyMeter {
  id: number
  identification: string
  make?: string
  model?: string
  plant_id?: number
  shed_id?: number
  section_id?: number
  machine_id?: number
  communication_protocol: CommProtocol
  slave_id?: number
  ip_address?: string
  port?: number
  baud_rate?: number
  ct_ratio: number
  vt_ratio: number
  enabled: boolean
  last_seen?: string
  communication_status: MeterStatus
  last_error?: string
  machine_name?: string
  section_name?: string
  shed_name?: string
  plant_name?: string
}

export interface MeterHealth {
  id: number
  identification: string
  make?: string
  model?: string
  machine_name?: string
  section_name?: string
  shed_name?: string
  communication_protocol: CommProtocol
  communication_status: MeterStatus
  last_seen?: string
  last_error?: string
  enabled: boolean
}

// ── Readings ──────────────────────────────────────────────────────────

export interface MeterReading {
  id: number
  timestamp: string
  meter_id: number
  voltage_r?: number
  voltage_y?: number
  voltage_b?: number
  voltage_ry?: number
  voltage_yb?: number
  voltage_br?: number
  current_r?: number
  current_y?: number
  current_b?: number
  frequency?: number
  active_power_kw?: number
  reactive_power_kvar?: number
  apparent_power_kva?: number
  power_factor?: number
  active_energy_kwh?: number
  reactive_energy_kvarh?: number
  apparent_energy_kvah?: number
  quality: number
  source: string
}

// ── Real-time WebSocket payload ───────────────────────────────────────

export interface RealtimeReading {
  type: 'meter_reading'
  meter_id: number
  meter_identification: string
  machine_name?: string
  section_name?: string
  timestamp: string
  active_power_kw?: number
  reactive_power_kvar?: number
  apparent_power_kva?: number
  power_factor?: number
  voltage_r?: number
  voltage_y?: number
  voltage_b?: number
  voltage_avg?: number
  current_r?: number
  current_y?: number
  current_b?: number
  current_avg?: number
  frequency?: number
  active_energy_kwh?: number
  communication_status: string
}

export interface WSBatchUpdate {
  type: 'batch_update'
  count: number
  readings: RealtimeReading[]
}

// ── Energy KPIs ───────────────────────────────────────────────────────

export interface EnergyKPI {
  plant_id: number
  plant_name: string
  shed_id?: number
  shed_name?: string
  section_id?: number
  section_name?: string
  today_kwh: number
  yesterday_kwh: number
  current_demand_kw: number
  peak_demand_kw: number
  avg_power_kw: number
  avg_power_factor: number
  current_month_kwh: number
  previous_month_kwh: number
  mom_change_pct: number
  active_machines: number
  online_meters: number
  total_meters: number
  last_updated?: string
}

export interface TrendPoint {
  timestamp: string
  value: number
  label?: string
}

export interface EnergyTrend {
  granularity: string
  unit: string
  data: TrendPoint[]
}

export interface SectionConsumption {
  section_id: number
  section_name: string
  shed_name: string
  today_kwh: number
  current_kw: number
  meter_count: number
  pct_of_total: number
}

export interface MachineConsumption {
  machine_id: number
  machine_name: string
  meter_identification?: string
  section_name: string
  shed_name: string
  today_kwh: number
  current_kw: number
  power_factor?: number
  voltage_avg?: number
  current_avg?: number
  status: string
}

// ── Alerts ────────────────────────────────────────────────────────────

export interface Alert {
  id: number
  alert_type: string
  severity: 'INFO' | 'WARNING' | 'CRITICAL'
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'
  message: string
  machine_name?: string
  meter_identification?: string
  value?: number
  threshold?: number
  fired_at: string
  acknowledged_at?: string
  resolved_at?: string
}

// ── Reports ───────────────────────────────────────────────────────────

export interface DailyReportRow {
  machine_name: string
  meter_identification: string
  section_name: string
  shed_name: string
  date: string
  opening_kwh: number
  closing_kwh: number
  consumption_kwh: number
  avg_kw: number
  peak_kw: number
  avg_pf: number
}

// ── Metrics ───────────────────────────────────────────────────────────

export interface MetricsSummary {
  total_kwh: number
  avg_power_kw: number
  avg_pf: number
  max_demand_kw: number
  avg_voltage: number
  avg_current: number
  reading_count: number
}
