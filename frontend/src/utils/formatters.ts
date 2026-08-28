/** Format a number with thousands separator and fixed decimal places */
export function fmt(value: number | undefined | null, decimals = 1): string {
  if (value == null || isNaN(value)) return '—'
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function fmtKwh(value: number | undefined | null): string {
  if (value == null) return '—'
  if (value >= 1_000_000) return `${fmt(value / 1_000_000, 2)} MWh`
  if (value >= 1_000) return `${fmt(value / 1000, 2)} MWh`
  return `${fmt(value, 1)} kWh`
}

export function fmtKw(value: number | undefined | null): string {
  if (value == null) return '—'
  return `${fmt(value, 1)} kW`
}

export function fmtPf(value: number | undefined | null): string {
  if (value == null) return '—'
  return fmt(value, 3)
}

export function fmtHz(value: number | undefined | null): string {
  if (value == null) return '—'
  return `${fmt(value, 2)} Hz`
}

export function fmtAmps(value: number | undefined | null): string {
  if (value == null) return '—'
  return `${fmt(value, 1)} A`
}

export function fmtVolts(value: number | undefined | null): string {
  if (value == null) return '—'
  return `${fmt(value, 1)} V`
}

export function fmtTimestamp(ts: string | undefined | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export function fmtDatetime(ts: string | undefined | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function pctChange(current: number, previous: number): { value: number; label: string } {
  if (previous === 0) return { value: 0, label: '0%' }
  const v = ((current - previous) / previous) * 100
  return { value: v, label: `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` }
}
