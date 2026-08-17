import { createAuthClient, createUserScopedClient } from '../integrations/supabase.client'
import { callGroq } from '../integrations/groq.client'
import type { PostDraft } from '../types/posts.types'

const SYSTEM_PROMPT = `You are a LinkedIn content strategist writing on behalf of a project team.
Write concise, engaging LinkedIn post drafts (roughly 80-200 words each, no hashtag spam, no emoji overload).
Respond with ONLY valid JSON matching this exact schema, no markdown fences, no commentary:
{"drafts": string[]}
"drafts" must contain between 1 and 3 items.`

function buildUserPrompt(projectName: string, objective: string) {
  return `Project: ${projectName}\nObjective: ${objective}\n\nWrite 1 to 3 distinct LinkedIn post draft variants for this project and objective.`
}

export type GeneratePostsResult =
  | { status: 'ok'; drafts: PostDraft[] }
  | { status: 'config_error'; message: string }
  | { status: 'unauthorized'; message: string }
  | { status: 'not_found'; message: string }
  | { status: 'timeout'; message: string }
  | { status: 'provider_unreachable'; message: string }
  | { status: 'rate_limited'; message: string }
  | { status: 'bad_response'; message: string }

export async function generatePostsForProject(params: {
  token: string
  projectId: string
  objective: string
}): Promise<GeneratePostsResult> {
  const { token, projectId, objective } = params

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
  const groqApiKey = process.env.GROQ_API_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return { status: 'config_error', message: 'Server misconfigured: missing Supabase env vars.' }
  }
  if (!groqApiKey) {
    return { status: 'config_error', message: 'Server misconfigured: missing GROQ_API_KEY.' }
  }

  const authClient = createAuthClient(supabaseUrl, supabaseAnonKey)
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token)
  if (userError || !user) {
    return { status: 'unauthorized', message: 'Invalid or expired session.' }
  }

  const userClient = createUserScopedClient(supabaseUrl, supabaseAnonKey, token)
  const { data: project, error: projectError } = await userClient
    .from('projects')
    .select('id, name')
    .eq('id', projectId)
    .single()
  if (projectError || !project) {
    return { status: 'not_found', message: 'Project not found, or you do not have access to it.' }
  }

  const groqResult = await callGroq(groqApiKey, SYSTEM_PROMPT, buildUserPrompt(project.name, objective))

  if (!groqResult.ok) {
    switch (groqResult.error.kind) {
      case 'timeout':
        return { status: 'timeout', message: 'AI generation timed out. Please try again.' }
      case 'unreachable':
        return { status: 'provider_unreachable', message: 'Could not reach the AI provider. Please try again.' }
      case 'rate_limited':
        return { status: 'rate_limited', message: 'AI provider rate limit reached. Please wait and try again.' }
      case 'http_error':
        return { status: 'provider_unreachable', message: 'AI generation failed. Please try again.' }
      case 'empty_response':
        return { status: 'bad_response', message: 'AI provider returned an empty response.' }
    }
  }

  let drafts: unknown
  try {
    drafts = JSON.parse(groqResult.content)?.drafts
  } catch {
    return { status: 'bad_response', message: 'AI response was not valid JSON.' }
  }

  if (!Array.isArray(drafts) || drafts.length === 0 || !drafts.every((d) => typeof d === 'string')) {
    return { status: 'bad_response', message: 'AI response did not match the expected format.' }
  }

  return { status: 'ok', drafts: drafts.slice(0, 3) }
}
