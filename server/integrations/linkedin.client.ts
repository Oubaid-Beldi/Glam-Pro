// The one place that calls LinkedIn's API directly — OAuth token exchange, the OpenID
// Connect userinfo lookup (to resolve the member URN posts must be authored as), and
// the UGC Posts publish call. Same "typed result, never throws" pattern as groq.client.ts.

const LINKEDIN_AUTHORIZATION_ENDPOINT = 'https://www.linkedin.com/oauth/v2/authorization'
const LINKEDIN_TOKEN_ENDPOINT = 'https://www.linkedin.com/oauth/v2/accessToken'
const LINKEDIN_USERINFO_ENDPOINT = 'https://api.linkedin.com/v2/userinfo'
const LINKEDIN_UGC_POSTS_ENDPOINT = 'https://api.linkedin.com/v2/ugcPosts'
const LINKEDIN_TIMEOUT_MS = 20_000

// "Sign In with LinkedIn using OpenID Connect" (openid + profile, for the member URN)
// plus "Share on LinkedIn" (w_member_social, for publishing) — both products must be
// added in the LinkedIn Developer app for this scope string to be granted.
const LINKEDIN_SCOPES = 'openid profile w_member_social'

export type LinkedInCallError =
  | { kind: 'timeout' }
  | { kind: 'unreachable' }
  | { kind: 'rate_limited' }
  | { kind: 'unauthorized' }
  | { kind: 'http_error' }
  | { kind: 'empty_response' }

export function buildAuthorizationUrl(params: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL(LINKEDIN_AUTHORIZATION_ENDPOINT)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('state', params.state)
  url.searchParams.set('scope', LINKEDIN_SCOPES)
  return url.toString()
}

export type ExchangeCodeResult =
  | { ok: true; accessToken: string; expiresInSeconds: number }
  | { ok: false; error: LinkedInCallError }

export async function exchangeCodeForToken(params: {
  clientId: string
  clientSecret: string
  redirectUri: string
  code: string
}): Promise<ExchangeCodeResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LINKEDIN_TIMEOUT_MS)

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    client_secret: params.clientSecret,
  })

  let response: Response
  try {
    response = await fetch(LINKEDIN_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeout)
    const timedOut = err instanceof Error && err.name === 'AbortError'
    return { ok: false, error: { kind: timedOut ? 'timeout' : 'unreachable' } }
  }
  clearTimeout(timeout)

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '<unreadable>')
    console.error('linkedin exchangeCodeForToken: non-ok response', response.status, bodyText)
    if (response.status === 429) return { ok: false, error: { kind: 'rate_limited' } }
    if (response.status === 400 || response.status === 401) return { ok: false, error: { kind: 'unauthorized' } }
    return { ok: false, error: { kind: 'http_error' } }
  }

  const json = (await response.json()) as { access_token?: string; expires_in?: number }
  if (!json.access_token || !json.expires_in) {
    return { ok: false, error: { kind: 'empty_response' } }
  }

  return { ok: true, accessToken: json.access_token, expiresInSeconds: json.expires_in }
}

export type FetchMemberUrnResult = { ok: true; memberUrn: string } | { ok: false; error: LinkedInCallError }

export async function fetchMemberUrn(accessToken: string): Promise<FetchMemberUrnResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LINKEDIN_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(LINKEDIN_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeout)
    const timedOut = err instanceof Error && err.name === 'AbortError'
    return { ok: false, error: { kind: timedOut ? 'timeout' : 'unreachable' } }
  }
  clearTimeout(timeout)

  if (!response.ok) {
    if (response.status === 401) return { ok: false, error: { kind: 'unauthorized' } }
    if (response.status === 429) return { ok: false, error: { kind: 'rate_limited' } }
    return { ok: false, error: { kind: 'http_error' } }
  }

  const json = (await response.json()) as { sub?: string }
  if (!json.sub) {
    return { ok: false, error: { kind: 'empty_response' } }
  }

  return { ok: true, memberUrn: `urn:li:person:${json.sub}` }
}

export type PublishPostResult = { ok: true } | { ok: false; error: LinkedInCallError }

export async function publishPost(params: {
  accessToken: string
  memberUrn: string
  content: string
}): Promise<PublishPostResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), LINKEDIN_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(LINKEDIN_UGC_POSTS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author: params.memberUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: params.content },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeout)
    const timedOut = err instanceof Error && err.name === 'AbortError'
    return { ok: false, error: { kind: timedOut ? 'timeout' : 'unreachable' } }
  }
  clearTimeout(timeout)

  if (!response.ok) {
    if (response.status === 401) return { ok: false, error: { kind: 'unauthorized' } }
    if (response.status === 429) return { ok: false, error: { kind: 'rate_limited' } }
    return { ok: false, error: { kind: 'http_error' } }
  }

  return { ok: true }
}
