import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import type { SectionConsumption } from '../../types'

interface Props {
  data: SectionConsumption[]
  height?: number
  onSectionClick?: (section: SectionConsumption) => void
}

export default function SectionBarChart({ data, height = 220, onSectionClick }: Props) {
  const sorted = [...data].sort((a, b) => a.today_kwh - b.today_kwh)

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    grid: { top: 8, right: 80, bottom: 8, left: 120, containLabel: false },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      textStyle: { color: '#e2e8f0', fontSize: 11 },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params
        const item = sorted[p.dataIndex]
        return `<b>${item.section_name}</b> (${item.shed_name})<br/>
                Today: <b>${item.today_kwh.toLocaleString('en-IN', { maximumFractionDigits: 0 })} kWh</b><br/>
                Now: ${item.current_kw.toFixed(1)} kW · ${item.meter_count} meters`
      },
    },
    xAxis: {
      type: 'value',
      axisLabel: { color: '#64748b', fontSize: 9, formatter: (v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v) },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'category',
      data: sorted.map((d) => d.section_name),
      axisLabel: { color: '#94a3b8', fontSize: 11 },
      axisLine: { lineStyle: { color: '#334155' } },
      axisTick: { show: false },
    },
    series: [
      {
        type: 'bar',
        data: sorted.map((d, i) => ({
          value: d.today_kwh,
          itemStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: 'rgba(59,130,246,0.3)' },
                { offset: 1, color: '#3b82f6' },
              ],
            },
            borderRadius: [0, 4, 4, 0],
          },
        })),
        barMaxWidth: 20,
        label: {
          show: true,
          position: 'right',
          color: '#64748b',
          fontSize: 10,
          formatter: (p: any) => {
            const item = sorted[p.dataIndex]
            return `${item.today_kwh.toLocaleString('en-IN', { maximumFractionDigits: 0 })} kWh`
          },
        },
      },
    ],
  }

  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'canvas' }}
      onEvents={{
        click: (params: any) => {
          if (onSectionClick) onSectionClick(sorted[params.dataIndex])
        },
      }}
    />
  )
}
