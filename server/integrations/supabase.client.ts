import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Centralizes every createClient() call in the codebase. Three factories, not one
// singleton, because the API layer needs two different auth shapes (anon key for
// verifying a user's token, anon key + that user's JWT for RLS-scoped queries) on
// top of the service-role admin client the scheduler uses to bypass RLS.

export function createAuthClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey)
}

export function createUserScopedClient(url: string, anonKey: string, accessToken: string): SupabaseClient {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

export function createAdminClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey)
}
