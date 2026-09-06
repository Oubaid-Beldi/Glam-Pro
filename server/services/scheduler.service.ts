import { createAdminClient } from '../integrations/supabase.client'
import { publishToLinkedIn } from './linkedin.service'

export type PublishDuePostsResult =
  | { status: 'ok'; publishedCount: number; failedCount: number; asOf: string }
  | { status: 'config_error' }
  | { status: 'query_error'; message: string }

type DuePostRow = {
  id: string
  content: string
  projects: { owner_id: string } | null
}

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
    .select('id, content, projects(owner_id)')
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
    const ownerId = post.projects?.owner_id
    const result = ownerId
      ? await publishToLinkedIn({ ownerId, content: post.content })
      : ({ status: 'config_error', message: 'Post has no owning project.' } as const)

    if (result.status === 'ok') {
      await supabase
        .from('posts')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('id', post.id)
      publishedCount++
    } else {
      await supabase.from('posts').update({ status: 'failed', error_message: result.message }).eq('id', post.id)
      failedCount++
    }
  }

  return { status: 'ok', publishedCount, failedCount, asOf: now }
}
