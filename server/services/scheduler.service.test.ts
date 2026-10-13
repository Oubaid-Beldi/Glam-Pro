import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createFakeSupabase } from '../test/fake-supabase'
import { publishDuePosts } from './scheduler.service'

const mocks = vi.hoisted(() => ({
  client: null as SupabaseClient | null,
  publishPost: vi.fn(),
}))

vi.mock('../integrations/supabase.client', () => ({
  createAdminClient: () => mocks.client,
}))

// Only the outbound LinkedIn HTTP call is mocked; linkedin.service's real token
// lookup (linkedin_accounts by user) runs against the in-memory fake.
vi.mock('../integrations/linkedin.client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../integrations/linkedin.client')>()),
  publishPost: mocks.publishPost,
}))

const PROJECT = '11111111-1111-4111-8111-111111111111'
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const MEMBER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const PAST = '2026-01-01T09:00:00.000Z'
const FAR_FUTURE = '2999-01-01T09:00:00.000Z'
const VALID_UNTIL = '2999-01-01T00:00:00.000Z'
const EXPIRED = '2020-01-01T00:00:00.000Z'

let tables: ReturnType<typeof createFakeSupabase>['tables']

function duePost(id: string, createdBy: string | null) {
  return {
    id,
    project_id: PROJECT,
    content: `content of ${id}`,
    platform: 'linkedin',
    status: 'scheduled',
    scheduled_at: PAST,
    created_by: createdBy,
  }
}

const post = (id: string) => tables.posts.find((p) => p.id === id)

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
  mocks.publishPost.mockReset()
  mocks.publishPost.mockResolvedValue({ ok: true })

  const fake = createFakeSupabase({
    projects: [{ id: PROJECT, owner_id: OWNER, name: 'Spring Launch' }],
    profiles: [
      { id: OWNER, email: 'owner@example.com', name: 'Olivia Owner' },
      { id: MEMBER, email: 'bob@example.com', name: 'Bob Member' },
    ],
    // The project OWNER is connected; the member is not (unless a test adds it).
    linkedin_accounts: [
      { owner_id: OWNER, access_token: 'owner-token', member_urn: 'urn:li:person:owner', expires_at: VALID_UNTIL },
    ],
    posts: [],
  })
  mocks.client = fake.client
  tables = fake.tables
})

describe('publishDuePosts', () => {
  it("publishes with the post author's own LinkedIn token", async () => {
    tables.linkedin_accounts.push({
      owner_id: MEMBER,
      access_token: 'member-token',
      member_urn: 'urn:li:person:member',
      expires_at: VALID_UNTIL,
    })
    tables.posts.push(duePost('p1', MEMBER))

    const result = await publishDuePosts()

    expect(result).toMatchObject({ status: 'ok', publishedCount: 1, failedCount: 0 })
    expect(mocks.publishPost).toHaveBeenCalledTimes(1)
    expect(mocks.publishPost).toHaveBeenCalledWith({
      accessToken: 'member-token',
      memberUrn: 'urn:li:person:member',
      content: 'content of p1',
    })
    expect(post('p1')).toMatchObject({ status: 'published', published_at: expect.any(String) })
  })

  it("fails a post whose author hasn't connected LinkedIn, instead of using the owner's account", async () => {
    tables.posts.push(duePost('p1', MEMBER))

    const result = await publishDuePosts()

    expect(result).toMatchObject({ status: 'ok', publishedCount: 0, failedCount: 1 })
    expect(mocks.publishPost).not.toHaveBeenCalled()
    expect(post('p1')?.status).toBe('failed')
    expect(post('p1')?.error_message).toContain("Bob Member hasn't connected a LinkedIn account")
  })

  it("fails with a reconnect message when the author's token has expired", async () => {
    tables.linkedin_accounts.push({
      owner_id: MEMBER,
      access_token: 'member-token',
      member_urn: 'urn:li:person:member',
      expires_at: EXPIRED,
    })
    tables.posts.push(duePost('p1', MEMBER))

    await publishDuePosts()

    expect(mocks.publishPost).not.toHaveBeenCalled()
    expect(post('p1')?.status).toBe('failed')
    expect(post('p1')?.error_message).toContain("Bob Member's LinkedIn connection expired")
  })

  it('fails a post with no recorded author without publishing it', async () => {
    tables.posts.push(duePost('p1', null))

    await publishDuePosts()

    expect(mocks.publishPost).not.toHaveBeenCalled()
    expect(post('p1')?.status).toBe('failed')
    expect(post('p1')?.error_message).toContain('no recorded author')
  })

  it('records a LinkedIn API failure on the post', async () => {
    tables.posts.push(duePost('p1', OWNER))
    mocks.publishPost.mockResolvedValue({ ok: false, error: { kind: 'rate_limited' } })

    const result = await publishDuePosts()

    expect(result).toMatchObject({ publishedCount: 0, failedCount: 1 })
    expect(post('p1')).toMatchObject({
      status: 'failed',
      error_message: 'LinkedIn rate limit reached. Please try again later.',
    })
  })

  it('handles each post with its own author in one run, and leaves posts that are not due alone', async () => {
    tables.posts.push(
      duePost('by-owner', OWNER),
      duePost('by-member', MEMBER),
      { ...duePost('future', OWNER), scheduled_at: FAR_FUTURE },
      { ...duePost('draft', OWNER), status: 'draft', scheduled_at: null },
    )

    const result = await publishDuePosts()

    expect(result).toMatchObject({ publishedCount: 1, failedCount: 1 })
    expect(mocks.publishPost).toHaveBeenCalledTimes(1)
    expect(mocks.publishPost).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'owner-token' }))
    expect(post('by-owner')?.status).toBe('published')
    expect(post('by-member')?.status).toBe('failed')
    expect(post('future')?.status).toBe('scheduled')
    expect(post('draft')?.status).toBe('draft')
  })
})
