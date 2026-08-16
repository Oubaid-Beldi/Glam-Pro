import express from 'express'
import serverless from 'serverless-http'
import { createClient } from '@supabase/supabase-js'

const app = express()
app.use(express.json())

const router = express.Router()

const GROQ_MODEL = 'llama-3.3-70b-versatile'
const GROQ_TIMEOUT_MS = 20_000

const SYSTEM_PROMPT = `You are a LinkedIn content strategist writing on behalf of a project team.
Write concise, engaging LinkedIn post drafts (roughly 80-200 words each, no hashtag spam, no emoji overload).
Respond with ONLY valid JSON matching this exact schema, no markdown fences, no commentary:
{"drafts": string[]}
"drafts" must contain between 1 and 3 items.`

function buildUserPrompt(projectName: string, objective: string) {
  return `Project: ${projectName}\nObjective: ${objective}\n\nWrite 1 to 3 distinct LinkedIn post draft variants for this project and objective.`
}

router.post('/generate-posts', async (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
  const groqApiKey = process.env.GROQ_API_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: 'Server misconfigured: missing Supabase env vars.' })
    return
  }
  if (!groqApiKey) {
    res.status(500).json({ error: 'Server misconfigured: missing GROQ_API_KEY.' })
    return
  }

  const authHeader = req.headers.authorization ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    res.status(401).json({ error: 'Missing Authorization bearer token.' })
    return
  }

  const { projectId, objective } = req.body ?? {}
  if (typeof projectId !== 'string' || typeof objective !== 'string' || !objective.trim()) {
    res.status(400).json({ error: 'projectId and objective are required.' })
    return
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey)
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token)
  if (userError || !user) {
    res.status(401).json({ error: 'Invalid or expired session.', detail: userError?.message })
    return
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: project, error: projectError } = await userClient
    .from('projects')
    .select('id, name')
    .eq('id', projectId)
    .single()
  if (projectError || !project) {
    res.status(404).json({ error: 'Project not found, or you do not have access to it.' })
    return
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS)

  let groqResponse: Response
  try {
    groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(project.name, objective.trim()) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.8,
      }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeout)
    const timedOut = err instanceof Error && err.name === 'AbortError'
    res.status(timedOut ? 504 : 502).json({
      error: timedOut
        ? 'AI generation timed out. Please try again.'
        : 'Could not reach the AI provider. Please try again.',
    })
    return
  }
  clearTimeout(timeout)

  if (!groqResponse.ok) {
    if (groqResponse.status === 429) {
      res.status(429).json({ error: 'AI provider rate limit reached. Please wait and try again.' })
      return
    }
    res.status(502).json({ error: 'AI generation failed. Please try again.' })
    return
  }

  const completion = await groqResponse.json()
  const rawContent: string | undefined = completion?.choices?.[0]?.message?.content

  if (!rawContent) {
    res.status(502).json({ error: 'AI provider returned an empty response.' })
    return
  }

  let drafts: unknown
  try {
    drafts = JSON.parse(rawContent)?.drafts
  } catch {
    res.status(502).json({ error: 'AI response was not valid JSON.' })
    return
  }

  if (!Array.isArray(drafts) || drafts.length === 0 || !drafts.every((d) => typeof d === 'string')) {
    res.status(502).json({ error: 'AI response did not match the expected format.' })
    return
  }

  res.json({ drafts: drafts.slice(0, 3) })
})

app.use('/api', router)

export const handler = serverless(app)
