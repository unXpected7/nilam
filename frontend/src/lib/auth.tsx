/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { requestHeaders } from './request'

export type Customer = { id: string; email: string; firstName: string | null; lastName: string | null }
type AuthContextValue = { user: Customer | null; loading: boolean; login: (email: string, password: string) => Promise<void>; register: (email: string, password: string, firstName: string) => Promise<void>; updateProfile: (firstName: string, lastName: string) => Promise<void>; changePassword: (currentPassword: string, newPassword: string) => Promise<void>; logout: () => Promise<void> }
const AuthContext = createContext<AuthContextValue | undefined>(undefined)

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`/api/auth${path}`, { ...init, headers: requestHeaders(init?.headers) })
  if (response.status === 204) return null
  const body = await response.json() as { user?: Customer | null; message?: string }
  if (!response.ok) throw new Error(body.message || 'Unable to complete this request')
  return body
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { request('/session').then(body => setUser(body?.user || null)).catch(() => setUser(null)).finally(() => setLoading(false)) }, [])
  const login = useCallback(async (email: string, password: string) => { const body = await request('/login', { method: 'POST', body: JSON.stringify({ email, password }) }); setUser(body?.user || null); window.dispatchEvent(new Event('nilam-auth-change')) }, [])
  const register = useCallback(async (email: string, password: string, firstName: string) => { const body = await request('/register', { method: 'POST', body: JSON.stringify({ email, password, firstName }) }); setUser(body?.user || null); window.dispatchEvent(new Event('nilam-auth-change')) }, [])
  const updateProfile = useCallback(async (firstName: string, lastName: string) => { const body = await request('/profile', { method: 'PATCH', body: JSON.stringify({ firstName, lastName }) }); setUser(body?.user || null) }, [])
  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => { const body = await request('/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }); setUser(body?.user || null); window.dispatchEvent(new Event('nilam-auth-change')) }, [])
  const logout = useCallback(async () => { await request('/logout', { method: 'POST' }); setUser(null); window.dispatchEvent(new Event('nilam-auth-change')) }, [])
  return <AuthContext.Provider value={{ user, loading, login, register, updateProfile, changePassword, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
