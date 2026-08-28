import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import type { TrendPoint } from '../../types'

interface Props {
  data: TrendPoint[]
  granularity: string
  height?: number
  loading?: boolean
}

export default function EnergyTrendChart({ data, granularity, height = 220, loading }: Props) {
  const option: EChartsOption = {
    backgroundColor: 'transparent',
    grid: { top: 16, right: 20, bottom: 32, left: 56, containLabel: false },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 12 },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params
        const ts = new Date(p.axisValue)
        const label = granularity === 'hourly'
          ? ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
          : ts.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
        return `<div style="font-size:11px;color:#94a3b8">${label}</div>
                <div style="color:#60a5fa;font-weight:600">${p.value?.toLocaleString('en-IN', { maximumFractionDigits: 0 })} kWh</div>`
      },
    },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.timestamp),
      axisLabel: {
        color: '#64748b',
        fontSize: 10,
        formatter: (v: string) => {
          const d = new Date(v)
          if (granularity === 'hourly') return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
          return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
        },
        interval: Math.floor(data.length / 6),
      },
      axisLine: { lineStyle: { color: '#334155' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#64748b', fontSize: 10, formatter: (v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v) },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: 'Energy (kWh)',
        type: 'line',
        data: data.map((d) => d.value),
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#3b82f6', width: 2 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(59,130,246,0.25)' },
              { offset: 1, color: 'rgba(59,130,246,0.02)' },
            ],
          },
        },
      },
    ],
    dataZoom: [{ type: 'inside', start: 0, end: 100 }],
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
