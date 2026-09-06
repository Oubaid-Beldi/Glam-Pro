import { createHmac, timingSafeEqual } from 'node:crypto'
import { createAuthClient, createAdminClient } from '../integrations/supabase.client'
import {
  buildAuthorizationUrl,
  exchangeCodeForToken,
  fetchMemberUrn,
  publishPost,
  type LinkedInCallError,
} from '../integrations/linkedin.client'
import type { LinkedInAccountRow } from '../types/linkedin.types'

// Must exactly match the redirect URI registered in the LinkedIn Developer app's Auth
// tab. One canonical live URL for this project (see CLAUDE.md), so it's hardcoded
// rather than derived from a request header.
const REDIRECT_URI = 'https://glampro.netlify.app/auth/linkedin/callback'

// Generous window for the redirect-based OAuth hop (authorize -> LinkedIn login/consent
// -> callback) to complete before a "state" is considered stale.
const STATE_TTL_MS = 10 * 60 * 1000

function signState(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url')
}

// LINKEDIN_CLIENT_SECRET doubles as the HMAC signing key for the OAuth "state" param —
// it's already a server-only secret dedicated to this integration, so no new env var
// is needed. This isn't exposing the secret; it just proves the state we get back on
// the callback is one we actually issued, so a forged uid can't hijack another user's
// LinkedIn connection.
function encodeState(uid: string, secret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify({ uid, ts: Date.now() }), 'utf8').toString('base64url')
  return `${encodedPayload}.${signState(encodedPayload, secret)}`
}

function decodeState(state: string, secret: string): { uid: string } | null {
  const [encodedPayload, signature] = state.split('.')
  if (!encodedPayload || !signature) return null

  const expected = signState(encodedPayload, secret)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as {
      uid?: string
      ts?: number
    }
    if (!payload.uid || !payload.ts || Date.now() - payload.ts > STATE_TTL_MS) return null
    return { uid: payload.uid }
  } catch {
    return null
  }
}

export type StartConnectResult =
  | { status: 'ok'; authorizationUrl: string }
  | { status: 'config_error'; message: string }
  | { status: 'unauthorized'; message: string }

export async function startLinkedInConnect(params: { token: string }): Promise<StartConnectResult> {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
  const clientId = process.env.LINKEDIN_CLIENT_ID
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET

  if (!supabaseUrl || !supabaseAnonKey) {
    return { status: 'config_error', message: 'Server misconfigured: missing Supabase env vars.' }
  }
  if (!clientId || !clientSecret) {
    return { status: 'config_error', message: 'Server misconfigured: missing LinkedIn env vars.' }
  }

  const authClient = createAuthClient(supabaseUrl, supabaseAnonKey)
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(params.token)
  if (error || !user) {
    return { status: 'unauthorized', message: 'Invalid or expired session.' }
  }

  const state = encodeState(user.id, clientSecret)
  return { status: 'ok', authorizationUrl: buildAuthorizationUrl({ clientId, redirectUri: REDIRECT_URI, state }) }
}

export type HandleCallbackResult = { status: 'ok' } | { status: 'error'; message: string }

export async function handleLinkedInCallback(params: {
  code: string
  state: string
}): Promise<HandleCallbackResult> {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const clientId = process.env.LINKEDIN_CLIENT_ID
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET

  if (!supabaseUrl || !serviceRoleKey || !clientId || !clientSecret) {
    return { status: 'error', message: 'Server misconfigured.' }
  }

  const decoded = decodeState(params.state, clientSecret)
  if (!decoded) {
    return { status: 'error', message: 'Invalid or expired connection request. Please try again.' }
  }

  const tokenResult = await exchangeCodeForToken({
    clientId,
    clientSecret,
    redirectUri: REDIRECT_URI,
    code: params.code,
  })
  if (!tokenResult.ok) {
    return { status: 'error', message: 'Could not complete LinkedIn authorization. Please try again.' }
  }

  const urnResult = await fetchMemberUrn(tokenResult.accessToken)
  if (!urnResult.ok) {
    return { status: 'error', message: 'Could not read your LinkedIn profile. Please try again.' }
  }

  const admin = createAdminClient(supabaseUrl, serviceRoleKey)
  const { error } = await admin.from('linkedin_accounts').upsert({
    owner_id: decoded.uid,
    access_token: tokenResult.accessToken,
    member_urn: urnResult.memberUrn,
    expires_at: new Date(Date.now() + tokenResult.expiresInSeconds * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  })
  if (error) {
    return { status: 'error', message: 'Could not save your LinkedIn connection. Please try again.' }
  }

  return { status: 'ok' }
}

export type LinkedInStatusResult =
  | { status: 'ok'; connected: boolean; expiresAt: string | null }
  | { status: 'config_error'; message: string }
  | { status: 'unauthorized'; message: string }

export async function getLinkedInStatus(params: { token: string }): Promise<LinkedInStatusResult> {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return { status: 'config_error', message: 'Server misconfigured.' }
  }

  const authClient = createAuthClient(supabaseUrl, supabaseAnonKey)
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(params.token)
  if (error || !user) {
    return { status: 'unauthorized', message: 'Invalid or expired session.' }
  }

  const admin = createAdminClient(supabaseUrl, serviceRoleKey)
  const { data } = await admin
    .from('linkedin_accounts')
    .select('expires_at')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!data) {
    return { status: 'ok', connected: false, expiresAt: null }
  }

  return { status: 'ok', connected: new Date(data.expires_at).getTime() > Date.now(), expiresAt: data.expires_at }
}

export type PublishToLinkedInResult =
  | { status: 'ok' }
  | { status: 'not_connected'; message: string }
  | { status: 'token_expired'; message: string }
  | { status: 'config_error'; message: string }
  | { status: 'timeout'; message: string }
  | { status: 'provider_unreachable'; message: string }
  | { status: 'rate_limited'; message: string }
  | { status: 'bad_response'; message: string }

function mapLinkedInError(error: LinkedInCallError): Exclude<PublishToLinkedInResult, { status: 'ok' }> {
  switch (error.kind) {
    case 'timeout':
      return { status: 'timeout', message: 'Publishing to LinkedIn timed out.' }
    case 'unreachable':
      return { status: 'provider_unreachable', message: 'Could not reach LinkedIn. Please try again.' }
    case 'rate_limited':
      return { status: 'rate_limited', message: 'LinkedIn rate limit reached. Please try again later.' }
    case 'unauthorized':
      return { status: 'token_expired', message: 'LinkedIn connection expired. Reconnect it from the Marketing page.' }
    case 'http_error':
      return { status: 'provider_unreachable', message: 'LinkedIn rejected the post. Please try again.' }
    case 'empty_response':
      return { status: 'bad_response', message: 'LinkedIn returned an unexpected response.' }
  }
}

export async function publishToLinkedIn(params: {
  ownerId: string
  content: string
}): Promise<PublishToLinkedInResult> {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return { status: 'config_error', message: 'Server misconfigured: missing Supabase env vars.' }
  }

  const admin = createAdminClient(supabaseUrl, serviceRoleKey)
  const { data: account } = await admin
    .from('linkedin_accounts')
    .select('access_token, member_urn, expires_at')
    .eq('owner_id', params.ownerId)
    .maybeSingle<LinkedInAccountRow>()

  if (!account) {
    return { status: 'not_connected', message: 'LinkedIn account not connected. Connect it from the Marketing page.' }
  }
  if (new Date(account.expires_at).getTime() <= Date.now()) {
    return { status: 'token_expired', message: 'LinkedIn connection expired. Reconnect it from the Marketing page.' }
  }

  const result = await publishPost({
    accessToken: account.access_token,
    memberUrn: account.member_urn,
    content: params.content,
  })

  return result.ok ? { status: 'ok' } : mapLinkedInError(result.error)
}
