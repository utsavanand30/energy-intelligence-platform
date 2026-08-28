import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Industrial palette — dark navy base
        brand: {
          50:  '#eef4ff',
          100: '#d9e8ff',
          200: '#bcd4fe',
          300: '#8fb6fd',
          400: '#608ef9',
          500: '#3b67f4',
          600: '#2448e9',
          700: '#1c37d6',
          800: '#1d2fad',
          900: '#1d2d88',
          950: '#161d54',
        },
        surface: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        energy: {
          green:  '#22c55e',
          amber:  '#f59e0b',
          red:    '#ef4444',
          blue:   '#3b82f6',
          purple: '#8b5cf6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
