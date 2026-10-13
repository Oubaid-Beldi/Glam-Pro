import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createFakeSupabase } from '../test/fake-supabase'
import { claimInvitations, inviteMember, removeMember, revokeInvitation } from './members.service'
import type { AuthUser } from '../types/auth.types'

const mockState = vi.hoisted(() => ({ client: null as SupabaseClient | null }))
vi.mock('../integrations/supabase.client', () => ({
  createAdminClient: () => mockState.client,
}))

const PROJECT = '11111111-1111-4111-8111-111111111111'
const OTHER_PROJECT = '22222222-2222-4222-8222-222222222222'
const OWNER: AuthUser = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'owner@example.com', emailVerified: true }
const MEMBER: AuthUser = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'member@example.com', emailVerified: true }
const OUTSIDER: AuthUser = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', email: 'outsider@example.com', emailVerified: true }

let tables: ReturnType<typeof createFakeSupabase>['tables']

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
  const fake = createFakeSupabase({
    projects: [
      { id: PROJECT, owner_id: OWNER.id, name: 'Spring Launch' },
      { id: OTHER_PROJECT, owner_id: OUTSIDER.id, name: 'Other Project' },
    ],
    profiles: [
      { id: OWNER.id, email: OWNER.email, name: 'Owner' },
      { id: MEMBER.id, email: MEMBER.email, name: 'Member' },
      { id: OUTSIDER.id, email: 'Outsider@Example.com', name: 'Outsider' },
    ],
    project_members: [
      { project_id: PROJECT, user_id: OWNER.id, role: 'owner' },
      { project_id: PROJECT, user_id: MEMBER.id, role: 'member' },
      { project_id: OTHER_PROJECT, user_id: OUTSIDER.id, role: 'owner' },
    ],
    project_invitations: [],
  })
  mockState.client = fake.client
  tables = fake.tables
})

const membersOf = (projectId: string) =>
  tables.project_members.filter((m) => m.project_id === projectId).map((m) => m.user_id)

describe('inviteMember', () => {
  it('lets the owner invite an unknown email as a pending, normalized invitation', async () => {
    const result = await inviteMember({ caller: OWNER, projectId: PROJECT, email: '  New.Person@Example.COM ' })

    expect(result.status).toBe('ok')
    expect(result.status === 'ok' && result.outcome.kind).toBe('invited')
    expect(tables.project_invitations).toHaveLength(1)
    expect(tables.project_invitations[0]).toMatchObject({
      project_id: PROJECT,
      email: 'new.person@example.com',
      invited_by: OWNER.id,
      status: 'pending',
    })
  })

  it('rejects a non-owner member', async () => {
    const result = await inviteMember({ caller: MEMBER, projectId: PROJECT, email: 'new@example.com' })

    expect(result.status).toBe('forbidden')
    expect(tables.project_invitations).toHaveLength(0)
  })

  it('rejects someone who is not in the project at all', async () => {
    const result = await inviteMember({ caller: OUTSIDER, projectId: PROJECT, email: 'new@example.com' })

    expect(result.status).toBe('not_found')
    expect(tables.project_invitations).toHaveLength(0)
  })

  it('adds an existing user directly and records the invitation as accepted', async () => {
    // Stored profile email has different casing from what the owner typed.
    const result = await inviteMember({ caller: OWNER, projectId: PROJECT, email: 'outsider@example.com' })

    expect(result.status).toBe('ok')
    expect(result.status === 'ok' && result.outcome.kind).toBe('added')
    expect(membersOf(PROJECT)).toContain(OUTSIDER.id)
    expect(tables.project_members.find((m) => m.user_id === OUTSIDER.id && m.project_id === PROJECT)?.role).toBe(
      'member',
    )
    expect(tables.project_invitations).toEqual([
      expect.objectContaining({ email: 'outsider@example.com', status: 'accepted', accepted_at: expect.any(String) }),
    ])
  })

  it('rejects a duplicate pending invitation', async () => {
    await inviteMember({ caller: OWNER, projectId: PROJECT, email: 'new@example.com' })
    const second = await inviteMember({ caller: OWNER, projectId: PROJECT, email: 'NEW@example.com' })

    expect(second.status).toBe('conflict')
    expect(tables.project_invitations).toHaveLength(1)
  })

  it('rejects inviting someone who is already a member', async () => {
    const result = await inviteMember({ caller: OWNER, projectId: PROJECT, email: MEMBER.email! })

    expect(result.status).toBe('conflict')
    expect(tables.project_invitations).toHaveLength(0)
  })

  it('does not treat email wildcards as matches', async () => {
    const result = await inviteMember({ caller: OWNER, projectId: PROJECT, email: 'outsider@example_com' })

    expect(result.status === 'ok' && result.outcome.kind).toBe('invited')
    expect(membersOf(PROJECT)).not.toContain(OUTSIDER.id)
  })
})

describe('revokeInvitation', () => {
  it('lets the owner revoke a pending invitation', async () => {
    const invited = await inviteMember({ caller: OWNER, projectId: PROJECT, email: 'new@example.com' })
    const invitationId = invited.status === 'ok' && invited.outcome.kind === 'invited' ? invited.outcome.invitation.id : ''

    const result = await revokeInvitation({ caller: OWNER, projectId: PROJECT, invitationId })

    expect(result.status).toBe('ok')
    expect(tables.project_invitations[0].status).toBe('revoked')
  })

  it('rejects a non-owner', async () => {
    const invited = await inviteMember({ caller: OWNER, projectId: PROJECT, email: 'new@example.com' })
    const invitationId = invited.status === 'ok' && invited.outcome.kind === 'invited' ? invited.outcome.invitation.id : ''

    const result = await revokeInvitation({ caller: MEMBER, projectId: PROJECT, invitationId })

    expect(result.status).toBe('forbidden')
    expect(tables.project_invitations[0].status).toBe('pending')
  })
})

describe('removeMember', () => {
  it("doesn't let the owner remove themselves", async () => {
    const result = await removeMember({ caller: OWNER, projectId: PROJECT, userId: OWNER.id })

    expect(result.status).toBe('forbidden')
    expect(membersOf(PROJECT)).toContain(OWNER.id)
  })

  it("doesn't let a member remove the owner", async () => {
    const result = await removeMember({ caller: MEMBER, projectId: PROJECT, userId: OWNER.id })

    expect(result.status).toBe('forbidden')
    expect(membersOf(PROJECT)).toContain(OWNER.id)
  })

  it('lets the owner remove a member', async () => {
    const result = await removeMember({ caller: OWNER, projectId: PROJECT, userId: MEMBER.id })

    expect(result.status).toBe('ok')
    expect(membersOf(PROJECT)).not.toContain(MEMBER.id)
  })

  it('lets a member leave', async () => {
    const result = await removeMember({ caller: MEMBER, projectId: PROJECT, userId: MEMBER.id })

    expect(result.status).toBe('ok')
    expect(membersOf(PROJECT)).not.toContain(MEMBER.id)
  })

  it("doesn't let a member remove another member", async () => {
    tables.project_members.push({ project_id: PROJECT, user_id: OUTSIDER.id, role: 'member' })

    const result = await removeMember({ caller: MEMBER, projectId: PROJECT, userId: OUTSIDER.id })

    expect(result.status).toBe('forbidden')
    expect(membersOf(PROJECT)).toContain(OUTSIDER.id)
  })
})

describe('claimInvitations', () => {
  const NEWCOMER: AuthUser = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', email: 'New@Example.com', emailVerified: true }

  beforeEach(() => {
    tables.project_invitations.push(
      { id: 'inv-1', project_id: PROJECT, email: 'new@example.com', status: 'pending' },
      { id: 'inv-2', project_id: OTHER_PROJECT, email: 'someone.else@example.com', status: 'pending' },
      { id: 'inv-3', project_id: OTHER_PROJECT, email: 'new@example.com', status: 'revoked' },
    )
  })

  it("converts only pending invitations matching the caller's email", async () => {
    const result = await claimInvitations({ caller: NEWCOMER })

    expect(result).toEqual({ status: 'ok', joined: [{ projectId: PROJECT, projectName: 'Spring Launch' }] })
    expect(membersOf(PROJECT)).toContain(NEWCOMER.id)
    expect(membersOf(OTHER_PROJECT)).not.toContain(NEWCOMER.id)
    expect(tables.project_invitations.find((i) => i.id === 'inv-1')).toMatchObject({ status: 'accepted' })
    expect(tables.project_invitations.find((i) => i.id === 'inv-2')).toMatchObject({ status: 'pending' })
    expect(tables.project_invitations.find((i) => i.id === 'inv-3')).toMatchObject({ status: 'revoked' })
  })

  it('claims nothing for a caller whose email is unverified', async () => {
    const result = await claimInvitations({ caller: { ...NEWCOMER, emailVerified: false } })

    expect(result).toEqual({ status: 'ok', joined: [] })
    expect(membersOf(PROJECT)).not.toContain(NEWCOMER.id)
    expect(tables.project_invitations.find((i) => i.id === 'inv-1')).toMatchObject({ status: 'pending' })
  })

  it('is a no-op on a second call', async () => {
    await claimInvitations({ caller: NEWCOMER })
    const second = await claimInvitations({ caller: NEWCOMER })

    expect(second).toEqual({ status: 'ok', joined: [] })
    expect(membersOf(PROJECT).filter((id) => id === NEWCOMER.id)).toHaveLength(1)
  })
})
