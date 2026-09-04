import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import ProtectedRoute from './auth/ProtectedRoute'
import Layout from './components/layout/Layout'

// Existing app pages
import EnergyOverview from './pages/EnergyOverview'
import EnergyHub from './pages/EnergyHub'
import LiveMetrics from './pages/LiveMetrics'
import Analytics from './pages/Analytics'
import SLDPage from './pages/SLD'
import MeterDetail from './pages/MeterDetail'
import Configuration from './pages/Configuration'
import Reports from './pages/Reports'
import MeterHealthPage from './pages/MeterHealth'

// Auth pages (created in Wave 8)
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import VerifyEmail from './pages/VerifyEmail'
import ChangePassword from './pages/ChangePassword'
import Unauthorized from './pages/Unauthorized'

// Admin pages (created in Wave 10)
import AdminUsers from './pages/admin/AdminUsers'
import AdminAuditLogs from './pages/admin/AdminAuditLogs'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* ── Public routes (no auth required) ─────────── */}
          <Route path="/login"           element={<Login />} />
          <Route path="/register"        element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password"  element={<ResetPassword />} />
          <Route path="/verify-email"    element={<VerifyEmail />} />
          <Route path="/unauthorized"    element={<Unauthorized />} />

          {/* Force password change — auth required, no Layout */}
          <Route path="/change-password" element={
            <ProtectedRoute><ChangePassword /></ProtectedRoute>
          } />

          {/* ── Protected app routes ──────────────────────── */}
          <Route path="/" element={
            <ProtectedRoute><Layout /></ProtectedRoute>
          }>
            <Route index element={<EnergyOverview />} />
            <Route path="energy-hub"    element={<EnergyHub />} />
            <Route path="live-metrics"  element={<LiveMetrics />} />
            <Route path="analytics"     element={<Analytics />} />
            <Route path="sld"           element={<SLDPage />} />
            <Route path="meter-detail/:meterId" element={<MeterDetail />} />
            <Route path="configuration" element={
              <ProtectedRoute requiredRole="ADMIN"><Configuration /></ProtectedRoute>
            } />
            <Route path="reports"       element={<Reports />} />
            <Route path="meter-health"  element={<MeterHealthPage />} />
          </Route>

          {/* ── Admin routes ──────────────────────────────── */}
          <Route path="/admin" element={
            <ProtectedRoute requiredRole="ADMIN"><Layout /></ProtectedRoute>
          }>
            <Route path="users"      element={<AdminUsers />} />
            <Route path="audit-logs" element={<AdminAuditLogs />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
