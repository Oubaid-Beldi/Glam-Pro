import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '../integrations/supabase.client'
import type { AuthUser } from '../types/auth.types'
import type {
  InviteResponseBody,
  JoinedProject,
  MemberRole,
  ProfileRow,
  ProjectInvitationRow,
} from '../types/members.types'

// Every function here runs on the service-role client, which bypasses RLS — so the
// owner/member checks below (assertOwner / assertMember) ARE the authorization.
// They mirror the database policies; neither layer relies on projects.owner_id.

export type MembersFailure =
  | { status: 'config_error'; message: string }
  | { status: 'bad_request'; message: string }
  | { status: 'not_found'; message: string }
  | { status: 'forbidden'; message: string }
  | { status: 'conflict'; message: string }
  | { status: 'db_error'; message: string }

export type InviteMemberResult = { status: 'ok'; outcome: InviteResponseBody } | MembersFailure
export type RevokeInvitationResult = { status: 'ok' } | MembersFailure
export type RemoveMemberResult = { status: 'ok' } | MembersFailure
export type ClaimInvitationsResult = { status: 'ok'; joined: JoinedProject[] } | MembersFailure

const PROJECT_NOT_FOUND: MembersFailure = {
  status: 'not_found',
  message: 'Project not found, or you do not have access to it.',
}

const UNIQUE_VIOLATION = '23505'

function dbError(error: PostgrestError, context: string): MembersFailure {
  console.error(`members: ${context}`, error.message)
  return { status: 'db_error', message: 'Something went wrong. Please try again.' }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// ilike treats % and _ as wildcards; escape them so an email only matches itself.
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

function getAdminClient(): SupabaseClient | null {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return null
  return createAdminClient(supabaseUrl, serviceRoleKey)
}

const CONFIG_ERROR: MembersFailure = {
  status: 'config_error',
  message: 'Server misconfigured: missing Supabase env vars.',
}

type RoleLookup = { ok: true; role: MemberRole | null } | { ok: false; failure: MembersFailure }

async function getRole(db: SupabaseClient, projectId: string, userId: string): Promise<RoleLookup> {
  const { data, error } = await db
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle<{ role: MemberRole }>()
  if (error) return { ok: false, failure: dbError(error, 'role lookup failed') }
  return { ok: true, role: data?.role ?? null }
}

type Assertion = { ok: true; role: MemberRole } | { ok: false; failure: MembersFailure }

export async function assertMember(db: SupabaseClient, projectId: string, userId: string): Promise<Assertion> {
  const lookup = await getRole(db, projectId, userId)
  if (!lookup.ok) return lookup
  if (!lookup.role) return { ok: false, failure: PROJECT_NOT_FOUND }
  return { ok: true, role: lookup.role }
}

export async function assertOwner(db: SupabaseClient, projectId: string, userId: string): Promise<Assertion> {
  const member = await assertMember(db, projectId, userId)
  if (!member.ok) return member
  if (member.role !== 'owner') {
    return { ok: false, failure: { status: 'forbidden', message: 'Only the project owner can do this.' } }
  }
  return member
}

export async function inviteMember(params: {
  caller: AuthUser
  projectId: string
  email: string
}): Promise<InviteMemberResult> {
  const db = getAdminClient()
  if (!db) return CONFIG_ERROR

  const email = normalizeEmail(params.email)
  if (!email) return { status: 'bad_request', message: 'An email address is required.' }

  const owner = await assertOwner(db, params.projectId, params.caller.id)
  if (!owner.ok) return owner.failure

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('id, email, name')
    .ilike('email', escapeLikePattern(email))
    .limit(1)
    .maybeSingle<ProfileRow>()
  if (profileError) return dbError(profileError, 'profile lookup failed')

  const now = new Date().toISOString()

  // Existing user: add them right away and record the invitation as accepted.
  if (profile) {
    const existing = await getRole(db, params.projectId, profile.id)
    if (!existing.ok) return existing.failure
    if (existing.role) return { status: 'conflict', message: 'That person is already a member of this project.' }

    const { error: insertError } = await db
      .from('project_members')
      .insert({ project_id: params.projectId, user_id: profile.id, role: 'member' })
    if (insertError) {
      if (insertError.code === UNIQUE_VIOLATION) {
        return { status: 'conflict', message: 'That person is already a member of this project.' }
      }
      return dbError(insertError, 'member insert failed')
    }

    // If an older pending invitation for this email exists, accept it rather than
    // adding a second record (the partial unique index allows only one pending).
    const { data: accepted, error: acceptError } = await db
      .from('project_invitations')
      .update({ status: 'accepted', accepted_at: now })
      .eq('project_id', params.projectId)
      .eq('email', email)
      .eq('status', 'pending')
      .select('id')
    if (acceptError) return dbError(acceptError, 'pending invitation accept failed')

    if (!accepted || accepted.length === 0) {
      const { error: recordError } = await db.from('project_invitations').insert({
        project_id: params.projectId,
        email,
        invited_by: params.caller.id,
        status: 'accepted',
        accepted_at: now,
      })
      if (recordError) return dbError(recordError, 'accepted invitation insert failed')
    }

    return {
      status: 'ok',
      outcome: { kind: 'added', member: { userId: profile.id, email: profile.email, name: profile.name } },
    }
  }

  // Unknown email: store a pending invitation, claimed on their first sign-in.
  const { data: pending, error: pendingError } = await db
    .from('project_invitations')
    .select('id')
    .eq('project_id', params.projectId)
    .eq('email', email)
    .eq('status', 'pending')
    .maybeSingle()
  if (pendingError) return dbError(pendingError, 'pending invitation lookup failed')
  if (pending) return { status: 'conflict', message: 'That email already has a pending invitation.' }

  const { data: invitation, error: inviteError } = await db
    .from('project_invitations')
    .insert({ project_id: params.projectId, email, invited_by: params.caller.id, status: 'pending' })
    .select('*')
    .single<ProjectInvitationRow>()
  if (inviteError) {
    if (inviteError.code === UNIQUE_VIOLATION) {
      return { status: 'conflict', message: 'That email already has a pending invitation.' }
    }
    return dbError(inviteError, 'invitation insert failed')
  }

  return { status: 'ok', outcome: { kind: 'invited', invitation } }
}

export async function revokeInvitation(params: {
  caller: AuthUser
  projectId: string
  invitationId: string
}): Promise<RevokeInvitationResult> {
  const db = getAdminClient()
  if (!db) return CONFIG_ERROR

  const owner = await assertOwner(db, params.projectId, params.caller.id)
  if (!owner.ok) return owner.failure

  const { data: invitation, error } = await db
    .from('project_invitations')
    .select('id, status')
    .eq('id', params.invitationId)
    .eq('project_id', params.projectId)
    .maybeSingle<Pick<ProjectInvitationRow, 'id' | 'status'>>()
  if (error) return dbError(error, 'invitation lookup failed')
  if (!invitation) return { status: 'not_found', message: 'Invitation not found.' }
  if (invitation.status !== 'pending') {
    return { status: 'conflict', message: 'Only pending invitations can be revoked.' }
  }

  const { error: updateError } = await db
    .from('project_invitations')
    .update({ status: 'revoked' })
    .eq('id', invitation.id)
  if (updateError) return dbError(updateError, 'invitation revoke failed')

  return { status: 'ok' }
}

// The owner can remove any member except themselves; a member can remove only
// themselves (leaving). Nobody can remove the owner row.
export async function removeMember(params: {
  caller: AuthUser
  projectId: string
  userId: string
}): Promise<RemoveMemberResult> {
  const db = getAdminClient()
  if (!db) return CONFIG_ERROR

  const caller = await assertMember(db, params.projectId, params.caller.id)
  if (!caller.ok) return caller.failure

  const target = await getRole(db, params.projectId, params.userId)
  if (!target.ok) return target.failure
  if (!target.role) return { status: 'not_found', message: 'That person is not a member of this project.' }

  if (target.role === 'owner') {
    return { status: 'forbidden', message: "The project owner can't be removed from the project." }
  }

  const isLeaving = params.userId === params.caller.id
  if (!isLeaving && caller.role !== 'owner') {
    return { status: 'forbidden', message: 'Only the project owner can remove other members.' }
  }

  const { error } = await db
    .from('project_members')
    .delete()
    .eq('project_id', params.projectId)
    .eq('user_id', params.userId)
  if (error) return dbError(error, 'member delete failed')

  return { status: 'ok' }
}

// Converts every pending invitation addressed to the caller's verified email into
// a membership. The email always comes from the verified token, never the request.
export async function claimInvitations(params: { caller: AuthUser }): Promise<ClaimInvitationsResult> {
  const db = getAdminClient()
  if (!db) return CONFIG_ERROR

  const { caller } = params
  if (!caller.email || !caller.emailVerified) return { status: 'ok', joined: [] }
  const email = normalizeEmail(caller.email)

  const { data: invitations, error } = await db
    .from('project_invitations')
    .select('id, project_id')
    .eq('email', email)
    .eq('status', 'pending')
    .returns<Pick<ProjectInvitationRow, 'id' | 'project_id'>[]>()
  if (error) return dbError(error, 'pending invitations lookup failed')
  if (!invitations || invitations.length === 0) return { status: 'ok', joined: [] }

  const joinedIds: string[] = []

  for (const invitation of invitations) {
    const existing = await getRole(db, invitation.project_id, caller.id)
    if (!existing.ok) return existing.failure

    if (!existing.role) {
      const { error: insertError } = await db
        .from('project_members')
        .insert({ project_id: invitation.project_id, user_id: caller.id, role: 'member' })
      if (insertError && insertError.code !== UNIQUE_VIOLATION) {
        return dbError(insertError, 'claim member insert failed')
      }
      if (!insertError) joinedIds.push(invitation.project_id)
    }

    const { error: acceptError } = await db
      .from('project_invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invitation.id)
    if (acceptError) return dbError(acceptError, 'claim invitation accept failed')
  }

  if (joinedIds.length === 0) return { status: 'ok', joined: [] }

  const { data: projects, error: projectsError } = await db
    .from('projects')
    .select('id, name')
    .in('id', joinedIds)
    .returns<{ id: string; name: string }[]>()
  if (projectsError) return dbError(projectsError, 'joined projects lookup failed')

  return {
    status: 'ok',
    joined: (projects ?? []).map((p) => ({ projectId: p.id, projectName: p.name })),
  }
}
