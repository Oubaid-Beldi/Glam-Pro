import { createClient } from '@supabase/supabase-js'

export const handler = async () => {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('scheduler: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfigured.' }) }
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('posts')
    .update({ status: 'published', published_at: now })
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .select('id')

  if (error) {
    console.error('scheduler: failed to publish due posts:', error.message)
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
  }

  const publishedCount = data?.length ?? 0
  console.log(`scheduler: published ${publishedCount} post(s) due as of ${now}`)
  return { statusCode: 200, body: JSON.stringify({ published: publishedCount }) }
}
