import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, RefreshCw, Trash2 } from 'lucide-react'
import TopBar from '../../components/layout/TopBar'
import { adminApi, type AuthUser, type UserRole } from '../../api/auth'

const ROLE_OPTIONS: UserRole[] = ['ADMIN', 'ENERGY_ENGINEER', 'MAINTENANCE', 'OPERATOR', 'VIEWER']

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  ENERGY_ENGINEER: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  MAINTENANCE: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  OPERATOR: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  VIEWER: 'bg-surface-700 text-surface-400 border-surface-600',
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AuthUser[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', email: '', full_name: '', role: 'VIEWER' as UserRole, password: '' })
  const [addError, setAddError] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    adminApi.listUsers({ search: search || undefined })
      .then(setUsers)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [search])

  useEffect(() => { load() }, [load])

  const handleRoleChange = async (userId: number, role: UserRole) => {
    await adminApi.updateUser(userId, { role }).catch(console.error)
    load()
  }

  const handleToggleActive = async (userId: number, active: boolean) => {
    await adminApi.updateUser(userId, { active: !active }).catch(console.error)
    load()
  }

  const handleDelete = async (userId: number) => {
    if (!confirm('Deactivate this user?')) return
    await adminApi.deleteUser(userId).catch(console.error)
    load()
  }

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddLoading(true); setAddError('')
    try {
      await adminApi.createUser({ ...newUser, password: newUser.password || undefined })
      setShowAddModal(false)
      setNewUser({ username: '', email: '', full_name: '', role: 'VIEWER', password: '' })
      load()
    } catch (err: any) {
      setAddError(err.response?.data?.message ?? 'Failed to create user')
    } finally { setAddLoading(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar title="User Management" subtitle="Manage platform users and roles"
        actions={
          <button onClick={() => setShowAddModal(true)} className="btn-primary text-xs gap-1.5 py-1.5 px-3 flex items-center">
            <Plus size={12} /> Add User
          </button>
        }
      />
      <div className="flex-1 overflow-auto p-5">
        {/* Search */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
            <input className="input-field w-full pl-8 text-xs" placeholder="Search users…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button onClick={load} className="text-xs gap-1.5 py-1.5 px-3 flex items-center rounded-lg border border-surface-700 bg-surface-800 text-surface-400 hover:text-surface-200 transition-colors">
            <RefreshCw size={11} /> Refresh
          </button>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-800">
                {['User', 'Email', 'Role', 'Status', 'Last Login', 'Actions'].map(h => (
                  <th key={h} className="text-left text-[10px] font-semibold text-surface-500 uppercase tracking-wider px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-sm text-surface-500">Loading…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-sm text-surface-500">No users found</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="border-b border-surface-800/40 hover:bg-surface-800/20">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-brand-700 flex items-center justify-center text-xs font-bold text-white uppercase">
                        {(u.full_name ?? u.username).charAt(0)}
                      </div>
                      <div>
                        <div className="text-xs font-medium text-surface-200">{u.full_name ?? u.username}</div>
                        <div className="text-[10px] text-surface-500 font-mono">@{u.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-surface-400">{u.email ?? '—'}</td>
                  <td className="px-4 py-3">
                    <select value={u.role} onChange={e => handleRoleChange(u.id, e.target.value as UserRole)}
                      className={`text-[10px] font-semibold px-2 py-1 rounded border ${ROLE_COLORS[u.role]} bg-transparent cursor-pointer`}>
                      {ROLE_OPTIONS.map(r => <option key={r} value={r} className="bg-surface-800 text-surface-200">{r}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleToggleActive(u.id, u.active ?? true)}
                      className={`text-[10px] font-semibold px-2 py-1 rounded border ${
                        u.active !== false ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-red-500/20 text-red-300 border-red-500/30'
                      }`}>
                      {u.active !== false ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-[10px] text-surface-500 font-mono">
                    {u.last_login ? new Date(u.last_login).toLocaleDateString('en-IN') : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(u.id)} title="Deactivate"
                      className="text-surface-500 hover:text-red-400 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="card p-6 w-full max-w-sm mx-4 shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-4">Add New User</h3>
            {addError && <div className="mb-3 text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded px-3 py-2">{addError}</div>}
            <form onSubmit={handleAddUser} className="space-y-3">
              {[
                { key: 'username', label: 'Username *', type: 'text', required: true },
                { key: 'email', label: 'Email', type: 'email', required: false },
                { key: 'full_name', label: 'Full Name', type: 'text', required: false },
                { key: 'password', label: 'Password (auto-generate if empty)', type: 'password', required: false },
              ].map(f => (
                <div key={f.key} className="space-y-1">
                  <label className="text-[11px] text-surface-400">{f.label}</label>
                  <input type={f.type} required={f.required}
                    value={(newUser as any)[f.key]}
                    onChange={e => setNewUser(v => ({ ...v, [f.key]: e.target.value }))}
                    className="input-field w-full text-xs" />
                </div>
              ))}
              <div className="space-y-1">
                <label className="text-[11px] text-surface-400">Role</label>
                <select value={newUser.role} onChange={e => setNewUser(v => ({ ...v, role: e.target.value as UserRole }))}
                  className="input-field w-full text-xs">
                  {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 text-xs text-surface-400 hover:text-surface-200 border border-surface-700 rounded-lg">
                  Cancel
                </button>
                <button type="submit" disabled={addLoading}
                  className="flex-1 btn-primary text-xs py-2 rounded-lg disabled:opacity-60">
                  {addLoading ? 'Creating…' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
