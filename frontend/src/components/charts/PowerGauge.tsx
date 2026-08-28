import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

interface Props {
  currentKw: number
  maxKw: number
  label?: string
  size?: number
}

export default function PowerGauge({ currentKw, maxKw, label = 'Current Load', size = 200 }: Props) {
  const pct = maxKw > 0 ? Math.min(100, (currentKw / maxKw) * 100) : 0
  const color = pct >= 90 ? '#ef4444' : pct >= 75 ? '#f59e0b' : '#3b82f6'

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    series: [
      {
        type: 'gauge',
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: maxKw,
        radius: '88%',
        center: ['50%', '55%'],
        splitNumber: 5,
        axisLine: {
          lineStyle: {
            width: 10,
            color: [
              [pct / 100, color],
              [1, '#1e293b'],
            ],
          },
        },
        pointer: {
          icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
          length: '50%',
          width: 6,
          offsetCenter: [0, '-55%'],
          itemStyle: { color },
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        detail: {
          valueAnimation: true,
          fontSize: 18,
          fontWeight: 700,
          color: '#f1f5f9',
          formatter: (v) => `${v.toFixed(0)} kW`,
          offsetCenter: [0, '20%'],
        },
        title: {
          fontSize: 10,
          color: '#64748b',
          offsetCenter: [0, '45%'],
        },
        data: [{ value: Math.round(currentKw), name: label }],
      },
    ],
  }

  return (
    <ReactECharts
      option={option}
      style={{ height: size, width: size }}
      opts={{ renderer: 'canvas' }}
    />
  )
}
