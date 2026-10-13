import { createAuthClient } from '../integrations/supabase.client'
import type { AuthUser } from '../types/auth.types'

export type VerifyAccessTokenResult =
  | { status: 'ok'; user: AuthUser }
  | { status: 'config_error'; message: string }
  | { status: 'unauthorized'; message: string }

export async function verifyAccessToken(token: string): Promise<VerifyAccessTokenResult> {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return { status: 'config_error', message: 'Server misconfigured: missing Supabase env vars.' }
  }

  const authClient = createAuthClient(supabaseUrl, supabaseAnonKey)
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token)
  if (error || !user) {
    return { status: 'unauthorized', message: 'Invalid or expired session.' }
  }

  return {
    status: 'ok',
    user: { id: user.id, email: user.email ?? null, emailVerified: Boolean(user.email_confirmed_at) },
  }
}
