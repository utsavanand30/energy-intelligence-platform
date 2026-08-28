import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import type { MeterReading } from '../../types'

interface SeriesConfig {
  field: keyof MeterReading
  label: string
  color: string
  unit: string
}

interface Props {
  readings: MeterReading[]
  series: SeriesConfig[]
  height?: number
  loading?: boolean
}

export default function ElectricalChart({ readings, series, height = 180, loading }: Props) {
  const option: EChartsOption = {
    backgroundColor: 'transparent',
    grid: { top: 24, right: 16, bottom: 32, left: 48, containLabel: false },
    legend: {
      top: 2,
      right: 0,
      itemWidth: 10,
      itemHeight: 2,
      textStyle: { color: '#64748b', fontSize: 10 },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 11 },
      formatter: (params: any) => {
        const items = Array.isArray(params) ? params : [params]
        const ts = new Date(readings[items[0].dataIndex]?.timestamp || '').toLocaleTimeString('en-IN')
        return `<div style="color:#64748b;font-size:10px">${ts}</div>` +
          items.map((p: any) => {
            const cfg = series[p.seriesIndex]
            return `<span style="color:${cfg.color}">●</span> ${cfg.label}: <b>${Number(p.value).toFixed(2)} ${cfg.unit}</b>`
          }).join('<br/>')
      },
    },
    xAxis: {
      type: 'category',
      data: readings.map((r) => r.timestamp),
      axisLabel: {
        color: '#64748b', fontSize: 9,
        formatter: (v: string) => new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        interval: Math.floor(readings.length / 5),
      },
      axisLine: { lineStyle: { color: '#334155' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#64748b', fontSize: 9 },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: series.map((cfg) => ({
      name: cfg.label,
      type: 'line',
      data: readings.map((r) => r[cfg.field] as number ?? null),
      smooth: true,
      symbol: 'none',
      lineStyle: { color: cfg.color, width: 1.5 },
      itemStyle: { color: cfg.color },
    })),
    dataZoom: [{ type: 'inside' }],
  }

  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%' }}
      showLoading={loading}
      loadingOption={{ text: '', color: '#3b82f6', maskColor: 'rgba(15,23,42,0.7)' }}
      opts={{ renderer: 'canvas' }}
    />
  )
}
