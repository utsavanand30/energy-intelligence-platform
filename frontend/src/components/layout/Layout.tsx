import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useWebSocket } from '../../hooks/useWebSocket'

export default function Layout() {
  // Single WebSocket connection for the whole app lifetime
  useWebSocket()

  return (
    <div className="flex h-screen bg-surface-950 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col">
        <Outlet />
      </main>
    </div>
  )
}
