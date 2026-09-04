import { useState, useEffect, useCallback } from 'react'
import TopBar from '../../components/layout/TopBar'
import { adminApi } from '../../api/auth'
import { RefreshCw } from 'lucide-react'

const EVENT_COLORS: Record<string, string> = {
  LOGIN_SUCCESS: 'bg-emerald-500/20 text-emerald-300',
  LOGIN_FAILED: 'bg-red-500/20 text-red-300',
  LOGOUT: 'bg-surface-700 text-surface-400',
  REGISTER: 'bg-blue-500/20 text-blue-300',
  EMAIL_VERIFIED: 'bg-cyan-500/20 text-cyan-300',
  PASSWORD_RESET_REQUEST: 'bg-amber-500/20 text-amber-300',
  PASSWORD_RESET_COMPLETE: 'bg-amber-500/20 text-amber-300',
  PASSWORD_CHANGED: 'bg-amber-500/20 text-amber-300',
  ROLE_CHANGED: 'bg-purple-500/20 text-purple-300',
  ACCOUNT_LOCKED: 'bg-red-500/20 text-red-400',
  SSO_LOGIN: 'bg-indigo-500/20 text-indigo-300',
  TOKEN_REFRESHED: 'bg-surface-700 text-surface-500',
}

interface LogEntry {
  id: number
  user_id: number | null
  event_type: string
  ip_address: string | null
  details: Record<string, unknown> | null
  created_at: string
}

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [eventFilter, setEventFilter] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    adminApi.listAuditLogs({ page, limit: 50, event_type: eventFilter || undefined })
      .then((data: LogEntry[]) => setLogs(data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [page, eventFilter])

  useEffect(() => { load() }, [load])

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Audit Logs" subtitle="Authentication event history"
        actions={
          <button onClick={load} className="text-xs gap-1.5 py-1.5 px-3 flex items-center rounded-lg border border-surface-700 bg-surface-800 text-surface-400 hover:text-surface-200 transition-colors">
            <RefreshCw size={11} /> Refresh
          </button>
        }
      />
      <div className="flex-1 overflow-auto p-5">
        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <select className="input-field text-xs py-1.5" value={eventFilter} onChange={e => { setEventFilter(e.target.value); setPage(1) }}>
            <option value="">All events</option>
            {Object.keys(EVENT_COLORS).map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <div className="flex gap-1 ml-auto">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="text-xs px-2.5 py-1.5 rounded bg-surface-800 text-surface-400 hover:text-surface-200 disabled:opacity-40">
              ← Prev
            </button>
            <span className="text-xs text-surface-500 px-2.5 py-1.5">Page {page}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={logs.length < 50}
              className="text-xs px-2.5 py-1.5 rounded bg-surface-800 text-surface-400 hover:text-surface-200 disabled:opacity-40">
              Next →
            </button>
          </div>
        </div>

        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-800">
                {['Time', 'Event', 'User ID', 'IP', 'Details'].map(h => (
                  <th key={h} className="text-left text-[10px] font-semibold text-surface-500 uppercase tracking-wider px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8 text-sm text-surface-500">Loading…</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-sm text-surface-500">No logs found</td></tr>
              ) : logs.map(log => (
                <>
                  <tr key={log.id} onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                    className="border-b border-surface-800/40 hover:bg-surface-800/20 cursor-pointer">
                    <td className="px-4 py-2.5 text-[10px] font-mono text-surface-500">
                      {new Date(log.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'medium' })}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${EVENT_COLORS[log.event_type] ?? 'bg-surface-700 text-surface-400'}`}>
                        {log.event_type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[10px] text-surface-500 font-mono">{log.user_id ?? '—'}</td>
                    <td className="px-4 py-2.5 text-[10px] text-surface-500 font-mono">{log.ip_address ?? '—'}</td>
                    <td className="px-4 py-2.5 text-[10px] text-surface-500">
                      {log.details ? <span className="text-brand-400">▶ View</span> : '—'}
                    </td>
                  </tr>
                  {expanded === log.id && log.details && (
                    <tr key={`${log.id}-detail`} className="border-b border-surface-800/40">
                      <td colSpan={5} className="px-4 py-3 bg-surface-800/40">
                        <pre className="text-[10px] font-mono text-surface-300 whitespace-pre-wrap">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
