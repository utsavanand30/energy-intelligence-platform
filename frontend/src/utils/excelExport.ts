/**
 * Excel export utility using the SheetJS (xlsx) library.
 *
 * exportPolycabMonthlyReport() generates the exact format shown in the
 * reference screenshot:
 *
 *   Row 1  : "DAILY READING"  (merged across day columns)
 *   Row 2  : Process | Account Segment | 1 | 2 | … | 31 | MONTHLY KVAH
 *   Row 3+ : Section header rows (coloured) + machine data rows
 *   Last   : Grand total row
 *
 * exportGenericReport() creates a simple flat table for the Report Builder.
 */

import * as XLSX from 'xlsx'
import type { DailyReportRow } from '../types'

// ── Helper ────────────────────────────────────────────────────────────────

function dateRange(from: string, to: string): string[] {
  const dates: string[] = []
  const cur = new Date(from)
  const end = new Date(to)
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0])
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

function getDayNumbers(from: string, to: string): number[] {
  return dateRange(from, to).map(d => Number(d.split('-')[2]))
}

// ── Polycab monthly format (matches reference Excel screenshot) ───────────

export function exportPolycabMonthlyReport(
  rows: DailyReportRow[],
  fromDate: string,
  toDate: string,
  plantName = 'Daman Unit 2',
) {
  const dates   = dateRange(fromDate, toDate)
  const dayNums = getDayNumbers(fromDate, toDate)

  // Group rows by section → machine → date
  const bySection: Record<string, Record<string, Record<string, DailyReportRow>>> = {}
  for (const r of rows) {
    if (!bySection[r.section_name]) bySection[r.section_name] = {}
    if (!bySection[r.section_name][r.machine_name]) bySection[r.section_name][r.machine_name] = {}
    bySection[r.section_name][r.machine_name][r.date] = r
  }

  const wb = XLSX.utils.book_new()
  const wsData: (string | number | null)[][] = []

  // ── Title rows ──────────────────────────────────────────────────────────
  wsData.push([`${plantName} — Energy Report (${fromDate} to ${toDate})`])
  wsData.push([])

  // ── Header: "DAILY READING" merged ─────────────────────────────────────
  const headerRow1: (string | number | null)[] = ['Process', 'Account Segment', ...dayNums.map(() => ''), 'MONTHLY']
  headerRow1[2] = 'DAILY READING'
  wsData.push(headerRow1)

  // ── Sub-header: Process | Account | 1 | 2 | … | N | MONTHLY KVAH ───────
  const subHeader: (string | number | null)[] = ['Process', 'Account Segment', ...dayNums, 'MONTHLY KVAH']
  wsData.push(subHeader)

  // ── Data rows ───────────────────────────────────────────────────────────
  for (const [sectionName, machines] of Object.entries(bySection)) {
    // Section header row
    wsData.push([sectionName, '', ...dayNums.map(() => ''), ''])

    for (const [machineName, dateMap] of Object.entries(machines)) {
      // Get any row to extract meter info
      const anyRow = Object.values(dateMap)[0]
      const accountSegment = anyRow?.meter_identification ?? ''

      const dataRow: (string | number | null)[] = [machineName, accountSegment]
      let monthTotal = 0

      for (const date of dates) {
        const r = dateMap[date]
        const val = r ? Math.round(r.consumption_kwh) : null
        dataRow.push(val)
        if (val) monthTotal += val
      }

      dataRow.push(monthTotal > 0 ? Math.round(monthTotal) : null)
      wsData.push(dataRow)
    }
  }

  // ── Grand total row ─────────────────────────────────────────────────────
  const totalRow: (string | number | null)[] = ['GRAND TOTAL', '']
  for (let di = 0; di < dates.length; di++) {
    const colIdx = 2 + di
    let dayTotal = 0
    // Sum all machine rows (skip section header rows that have no numeric data)
    for (const row of wsData.slice(4)) {
      const v = row[colIdx]
      if (typeof v === 'number') dayTotal += v
    }
    totalRow.push(dayTotal > 0 ? Math.round(dayTotal) : null)
  }
  // Monthly total
  const grandMonthly = rows.reduce((s, r) => s + r.consumption_kwh, 0)
  totalRow.push(Math.round(grandMonthly))
  wsData.push(totalRow)

  // ── Create worksheet ────────────────────────────────────────────────────
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Column widths
  ws['!cols'] = [
    { wch: 22 },   // Process
    { wch: 28 },   // Account Segment
    ...dayNums.map(() => ({ wch: 7 })),  // Day columns
    { wch: 14 },   // Monthly total
  ]

  // ── Merge "DAILY READING" across day columns ────────────────────────────
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 + dayNums.length + 1 } },  // Title
    { s: { r: 2, c: 2 }, e: { r: 2, c: 1 + dayNums.length } },       // DAILY READING
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Energy Report')

  // ── Second sheet: Summary ───────────────────────────────────────────────
  const summaryData: (string | number)[][] = [
    ['Section', 'Machines', 'Total kWh', 'Avg kW', 'Avg PF'],
  ]
  for (const [sectionName, machines] of Object.entries(bySection)) {
    const sectionRows = Object.values(machines).flatMap(m => Object.values(m))
    const totalKwh = sectionRows.reduce((s, r) => s + r.consumption_kwh, 0)
    const avgKw    = sectionRows.reduce((s, r) => s + r.avg_kw,    0) / (sectionRows.length || 1)
    const avgPf    = sectionRows.reduce((s, r) => s + r.avg_pf,    0) / (sectionRows.length || 1)
    summaryData.push([sectionName, Object.keys(machines).length, Math.round(totalKwh), +avgKw.toFixed(1), +avgPf.toFixed(3)])
  }
  const wsSum = XLSX.utils.aoa_to_sheet(summaryData)
  wsSum['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, wsSum, 'Section Summary')

  // ── Download ────────────────────────────────────────────────────────────
  const filename = `${plantName.replace(/\s+/g, '_')}_Energy_${fromDate}_${toDate}.xlsx`
  XLSX.writeFile(wb, filename)
}

// ── Generic flat report ───────────────────────────────────────────────────

export function exportGenericReport(
  rows: DailyReportRow[],
  columns: { key: string; label: string }[],
  fromDate: string,
  toDate: string,
) {
  const headers = columns.map(c => c.label)
  const dataRows = rows.map(r =>
    columns.map(c => {
      switch (c.key) {
        case 'date':                 return r.date
        case 'shed_name':            return r.shed_name
        case 'section_name':         return r.section_name
        case 'machine_name':         return r.machine_name
        case 'meter_identification': return r.meter_identification
        case 'opening_kwh':          return +r.opening_kwh.toFixed(2)
        case 'closing_kwh':          return +r.closing_kwh.toFixed(2)
        case 'consumption_kwh':      return +r.consumption_kwh.toFixed(2)
        case 'avg_kw':               return +r.avg_kw.toFixed(1)
        case 'peak_kw':              return +r.peak_kw.toFixed(1)
        case 'avg_pf':               return +r.avg_pf.toFixed(3)
        default:                     return ''
      }
    })
  )

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows])

  // Auto column widths
  ws['!cols'] = columns.map(c => ({
    wch: Math.max(c.label.length + 2, 12),
  }))

  XLSX.utils.book_append_sheet(wb, ws, 'Energy Data')

  const filename = `EnergyReport_${fromDate}_${toDate}.xlsx`
  XLSX.writeFile(wb, filename)
}
