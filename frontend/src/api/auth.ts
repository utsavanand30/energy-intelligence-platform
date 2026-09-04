import api from './client'

export interface AuthUser {
  id: number
  username: string
  email: string | null
  full_name: string | null
  role: UserRole
  must_reset_password: boolean
  email_verified: boolean
  sso_provider: string | null
  profile_picture_url: string | null
  created_at: string
  last_login: string | null
  active: boolean
}

export type UserRole =
  | 'ADMIN'
  | 'ENERGY_ENGINEER'
  | 'MAINTENANCE'
  | 'OPERATOR'
  | 'VIEWER'

export interface LoginResponse {
  user: AuthUser
  message: string
  expires_at: string | null
}

export const authApi = {
  login: (data: { identifier: string; password: string; remember_me: boolean }) =>
    api.post<LoginResponse>('/auth/login', data).then((r) => r.data),

  register: (data: {
    full_name: string
    email: string
    username: string
    password: string
    confirm_password: string
  }) => api.post<{ message: string }>('/auth/register', data).then((r) => r.data),

  logout: () => api.post('/auth/logout').then((r) => r.data),

  me: () => api.get<AuthUser>('/auth/me').then((r) => r.data),

  refresh: () => api.post('/auth/refresh').then((r) => r.data),

  verifyEmail: (token: string) =>
    api.post('/auth/verify-email', { token }).then((r) => r.data),

  requestPasswordReset: (email: string) =>
    api.post('/auth/password-reset-request', { email }).then((r) => r.data),

  confirmPasswordReset: (data: {
    token: string
    new_password: string
    confirm_password: string
  }) => api.post('/auth/password-reset-confirm', data).then((r) => r.data),

  changePassword: (data: {
    current_password: string
    new_password: string
    confirm_password: string
  }) => api.post('/auth/change-password', data).then((r) => r.data),

  // SSO: causes a full page redirect (browser navigates to backend)
  ssoMicrosoft: () => {
    window.location.href = '/api/auth/sso/microsoft'
  },
  ssoGoogle: () => {
    window.location.href = '/api/auth/sso/google'
  },
}

export const adminApi = {
  listUsers: (params?: { role?: string; active?: boolean; search?: string }) =>
    api.get<AuthUser[]>('/admin/users', { params }).then((r) => r.data),

  createUser: (data: {
    username: string
    email?: string
    full_name?: string
    role: UserRole
    password?: string
  }) => api.post<AuthUser>('/admin/users', data).then((r) => r.data),

  updateUser: (
    id: number,
    data: { role?: UserRole; active?: boolean; full_name?: string },
  ) => api.patch<AuthUser>(`/admin/users/${id}`, data).then((r) => r.data),

  deleteUser: (id: number) =>
    api.delete<{ message: string }>(`/admin/users/${id}`).then((r) => r.data),

  listAuditLogs: (params?: {
    page?: number
    limit?: number
    event_type?: string
    user_id?: number
  }) => api.get('/admin/audit-logs', { params }).then((r) => r.data),
}
