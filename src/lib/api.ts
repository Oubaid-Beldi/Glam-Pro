import { supabase } from '@/lib/supabase'

// Authenticated call to our own /api backend. Reads the current Supabase session
// at call time (supabase-js keeps it refreshed) and sends its access token, and
// normalizes every failure into an error string — the backend always answers
// failures with { error }.
export async function apiFetch<T>(
  path: string,
  init: { method: 'GET' | 'POST' | 'DELETE'; body?: unknown } = { method: 'GET' },
): Promise<{ data: T | null; error: string | null }> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { data: null, error: 'You are signed out. Please sign in again.' }

  try {
    const res = await fetch(path, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
    if (res.status === 204) return { data: null, error: null }
    const json = await res.json().catch(() => null)
    if (!res.ok) return { data: null, error: json?.error ?? `Request failed (${res.status}).` }
    return { data: json as T, error: null }
  } catch {
    return { data: null, error: 'Could not reach the server. Please try again.' }
  }
}
