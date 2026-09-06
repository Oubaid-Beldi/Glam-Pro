export interface LinkedInAccountRow {
  owner_id: string
  access_token: string
  member_urn: string
  expires_at: string
}

export interface LinkedInStatusResponseBody {
  connected: boolean
  expiresAt: string | null
}
