export type MemberRole = 'owner' | 'member'
export type InvitationStatus = 'pending' | 'accepted' | 'revoked'

export type ProjectInvitationRow = {
  id: string
  project_id: string
  email: string
  invited_by: string | null
  status: InvitationStatus
  created_at: string
  accepted_at: string | null
}

export type ProfileRow = {
  id: string
  email: string | null
  name: string | null
}

export type InviteRequestBody = { email: string }

// "added": the email belonged to an existing user, who is now a member.
// "invited": no such user yet — a pending invitation was stored instead.
export type InviteResponseBody =
  | { kind: 'added'; member: { userId: string; email: string | null; name: string | null } }
  | { kind: 'invited'; invitation: ProjectInvitationRow }

export type JoinedProject = { projectId: string; projectName: string }

export type ClaimResponseBody = { joined: JoinedProject[] }
