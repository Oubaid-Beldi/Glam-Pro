import { createAdminClient } from '../integrations/supabase.client'

export type PublishDuePostsResult =
  | { status: 'ok'; publishedCount: number; asOf: string }
  | { status: 'config_error' }
  | { status: 'query_error'; message: string }

export async function publishDuePosts(): Promise<PublishDuePostsResult> {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return { status: 'config_error' }
  }

  const supabase = createAdminClient(supabaseUrl, serviceRoleKey)
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('posts')
    .update({ status: 'published', published_at: now })
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .select('id')

  if (error) {
    return { status: 'query_error', message: error.message }
  }

  return { status: 'ok', publishedCount: data?.length ?? 0, asOf: now }
}
