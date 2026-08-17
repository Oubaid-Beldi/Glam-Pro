import type { Request, Response } from 'express'
import { generatePostsForProject, type GeneratePostsResult } from '../services/posts.service'

const STATUS_CODE: Record<GeneratePostsResult['status'], number> = {
  ok: 200,
  config_error: 500,
  unauthorized: 401,
  not_found: 404,
  timeout: 504,
  provider_unreachable: 502,
  rate_limited: 429,
  bad_response: 502,
}

export async function generatePosts(req: Request, res: Response) {
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

  const result = await generatePostsForProject({ token, projectId, objective: objective.trim() })

  if (result.status === 'ok') {
    res.json({ drafts: result.drafts })
    return
  }

  res.status(STATUS_CODE[result.status]).json({ error: result.message })
}
