import { publishDuePosts } from '../../server/services/scheduler.service'

export const handler = async () => {
  const result = await publishDuePosts()

  if (result.status === 'config_error') {
    console.error('scheduler: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfigured.' }) }
  }

  if (result.status === 'query_error') {
    console.error('scheduler: failed to publish due posts:', result.message)
    return { statusCode: 500, body: JSON.stringify({ error: result.message }) }
  }

  console.log(`scheduler: published ${result.publishedCount} post(s) due as of ${result.asOf}`)
  return { statusCode: 200, body: JSON.stringify({ published: result.publishedCount }) }
}
