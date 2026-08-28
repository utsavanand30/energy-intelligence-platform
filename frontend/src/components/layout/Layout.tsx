import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import MobileNav from './MobileNav'
import { useWebSocket } from '../../hooks/useWebSocket'

export default function Layout() {
  useWebSocket()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen bg-surface-950 overflow-hidden">
      {/* ── Desktop sidebar (hidden on mobile) ─────────────── */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* ── Mobile sidebar overlay ──────────────────────────── */}
      {sidebarOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Drawer */}
          <div className="fixed left-0 top-0 bottom-0 z-50 lg:hidden"
            style={{ animation: 'slideInLeft 0.22s ease-out' }}>
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </>
      )}

      {/* ── Main content ────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {/* Hamburger button — mobile only */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-2.5 border-b border-surface-800 bg-surface-900">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-surface-800 transition-colors"
            aria-label="Open menu"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect y="2"  width="18" height="2" rx="1" fill="#94a3b8"/>
              <rect y="8"  width="18" height="2" rx="1" fill="#94a3b8"/>
              <rect y="14" width="18" height="2" rx="1" fill="#94a3b8"/>
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </div>
            <span className="text-sm font-bold text-white">EnergyIQ</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-16 lg:pb-0">
          <Outlet />
        </div>

        {/* ── Mobile bottom navigation bar ────────────────── */}
        <MobileNav />
      </main>

      <style>{`
        @keyframes slideInLeft {
          from { transform: translateX(-100%); opacity: 0; }
          to   { transform: translateX(0);     opacity: 1; }
        }
      `}</style>
    </div>
  )
}
