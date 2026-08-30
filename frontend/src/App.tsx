import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import EnergyOverview from './pages/EnergyOverview'
import EnergyHub from './pages/EnergyHub'
import LiveMetrics from './pages/LiveMetrics'
import Analytics from './pages/Analytics'
import SLDPage from './pages/SLD'
import MeterDetail from './pages/MeterDetail'
import Configuration from './pages/Configuration'
import Reports from './pages/Reports'
import MeterHealthPage from './pages/MeterHealth'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<EnergyOverview />} />
          <Route path="energy-hub" element={<EnergyHub />} />
          <Route path="live-metrics" element={<LiveMetrics />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="sld" element={<SLDPage />} />
          <Route path="meter-detail/:meterId" element={<MeterDetail />} />
          <Route path="configuration" element={<Configuration />} />
          <Route path="reports" element={<Reports />} />
          <Route path="meter-health" element={<MeterHealthPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
