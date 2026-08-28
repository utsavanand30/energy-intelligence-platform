import { useEffect, useRef } from 'react'
import { useRealtimeStore } from '../store/realtimeStore'
import type { WSBatchUpdate } from '../types'

/**
 * WebSocket URL strategy:
 *
 * Production (Render): frontend is served by FastAPI on the same origin.
 *   ws://your-app.onrender.com/ws/realtime  →  same host, same port
 *
 * Development: Vite runs on :5173, FastAPI on :8000.
 *   The Vite proxy forwards /ws/* to :8000, but it causes ECONNRESET on
 *   reconnects. So in dev we connect directly to :8000.
 */
function buildWsUrl(): string {
  const { protocol, hostname, port } = window.location
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:'

  // Production: same host/port as the page
  if (port !== '5173') {
    return `${wsProtocol}//${hostname}${port ? `:${port}` : ''}/ws/realtime`
  }

  // Development: bypass Vite proxy, connect directly to FastAPI
  return `${wsProtocol}//${hostname}:8000/ws/realtime`
}

const WS_URL = buildWsUrl()

export function useWebSocket() {
  const { setBatch, setConnected } = useRealtimeStore()
  const wsRef   = useRef<WebSocket | null>(null)
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let destroyed = false

    function connect() {
      if (destroyed) return
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        if (destroyed) { ws.close(); return }
        setConnected(true)
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, 25_000)
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'batch_update') {
            setBatch((msg as WSBatchUpdate).readings)
          }
        } catch { /* ignore malformed */ }
      }

      ws.onclose = () => {
        if (pingRef.current) clearInterval(pingRef.current)
        setConnected(false)
        if (!destroyed) {
          // Exponential backoff: 3 s first reconnect
          retryRef.current = setTimeout(connect, 3_000)
        }
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      destroyed = true
      if (pingRef.current)  clearInterval(pingRef.current)
      if (retryRef.current) clearTimeout(retryRef.current)
      wsRef.current?.close()
    }
  }, [setBatch, setConnected])
}
