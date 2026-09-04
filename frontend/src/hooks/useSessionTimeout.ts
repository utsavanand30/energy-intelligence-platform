import { useEffect, useRef, useState, useCallback } from 'react'
import { authApi } from '../api/auth'
import { useAuth } from '../auth/useAuth'

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const
const WARNING_BEFORE_MS = 5 * 60 * 1000

export function useSessionTimeout() {
  const { user, logout } = useAuth()
  const [showWarning, setShowWarning] = useState(false)
  const warningTimer  = useRef<ReturnType<typeof setTimeout>>()
  const logoutTimer   = useRef<ReturnType<typeof setTimeout>>()

  const clearTimers = useCallback(() => {
    clearTimeout(warningTimer.current)
    clearTimeout(logoutTimer.current)
  }, [])

  const scheduleTimers = useCallback(() => {
    const expStr = localStorage.getItem('token_exp')
    if (!expStr) return
    const exp = parseInt(expStr, 10) * 1000
    const now = Date.now()
    const msUntilExpiry = exp - now
    if (msUntilExpiry <= 0) { logout(); return }
    clearTimers()
    const msUntilWarning = msUntilExpiry - WARNING_BEFORE_MS
    if (msUntilWarning > 0) {
      warningTimer.current = setTimeout(() => setShowWarning(true), msUntilWarning)
    } else {
      setShowWarning(true)
    }
    logoutTimer.current = setTimeout(() => {
      logout()
      window.location.href = '/login?reason=session_expired'
    }, msUntilExpiry)
  }, [clearTimers, logout])

  const continueSession = useCallback(async () => {
    try {
      await authApi.refresh()
      setShowWarning(false)
      scheduleTimers()
    } catch {
      logout()
    }
  }, [logout, scheduleTimers])

  useEffect(() => {
    if (!user) return
    scheduleTimers()
    const handler = () => scheduleTimers()
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, handler, { passive: true }))
    return () => {
      clearTimers()
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, handler))
    }
  }, [user, scheduleTimers, clearTimers])

  return { showWarning, continueSession, logout }
}
