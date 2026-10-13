import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '../integrations/supabase.client'
import { publishToLinkedIn, type PublishToLinkedInResult } from './linkedin.service'

export type PublishDuePostsResult =
  | { status: 'ok'; publishedCount: number; failedCount: number; asOf: string }
  | { status: 'config_error' }
  | { status: 'query_error'; message: string }

type DuePostRow = {
  id: string
  content: string
  created_by: string | null
}

async function displayName(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase
    .from('profiles')
    .select('name, email')
    .eq('id', userId)
    .maybeSingle<{ name: string | null; email: string | null }>()
  return data?.name ?? data?.email ?? 'The post author'
}

// The failure messages a teammate reads on the post card name the author, so
// it's clear whose LinkedIn connection is missing.
async function failureMessage(
  supabase: SupabaseClient,
  authorId: string,
  result: Exclude<PublishToLinkedInResult, { status: 'ok' }>,
): Promise<string> {
  switch (result.status) {
    case 'not_connected':
      return `${await displayName(supabase, authorId)} hasn't connected a LinkedIn account. Connect it from the Marketing page, or publish manually.`
    case 'token_expired':
      return `${await displayName(supabase, authorId)}'s LinkedIn connection expired. Reconnect it from the Marketing page.`
    default:
      return result.message
  }
}

// Each due post is published with the LinkedIn token of the member who created it
// (posts.created_by) — tokens belong to individual users, never to a project. If
// the author has no usable connection the post fails with an explanation; it is
// never published from someone else's account.
export async function publishDuePosts(): Promise<PublishDuePostsResult> {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return { status: 'config_error' }
  }

  const supabase = createAdminClient(supabaseUrl, serviceRoleKey)
  const now = new Date().toISOString()

  const { data: duePosts, error } = await supabase
    .from('posts')
    .select('id, content, created_by')
    .eq('status', 'scheduled')
    .eq('platform', 'linkedin')
    .lte('scheduled_at', now)
    .returns<DuePostRow[]>()

  if (error) {
    return { status: 'query_error', message: error.message }
  }

  let publishedCount = 0
  let failedCount = 0

  for (const post of duePosts ?? []) {
    let errorMessage: string | null = null

    if (!post.created_by) {
      errorMessage = "This post has no recorded author, so there's no LinkedIn account to publish it from. Publish it manually."
    } else {
      const result = await publishToLinkedIn({ userId: post.created_by, content: post.content })
      if (result.status !== 'ok') {
        errorMessage = await failureMessage(supabase, post.created_by, result)
      }
    }

    if (errorMessage === null) {
      await supabase
        .from('posts')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('id', post.id)
      publishedCount++
    } else {
      await supabase.from('posts').update({ status: 'failed', error_message: errorMessage }).eq('id', post.id)
      failedCount++
    }
  }

  return { status: 'ok', publishedCount, failedCount, asOf: now }
}
