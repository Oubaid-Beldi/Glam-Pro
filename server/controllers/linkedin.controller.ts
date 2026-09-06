import type { Request, Response } from 'express'
import {
  startLinkedInConnect,
  handleLinkedInCallback,
  getLinkedInStatus,
  type LinkedInStatusResult,
} from '../services/linkedin.service'

const STATUS_CODE: Record<LinkedInStatusResult['status'], number> = {
  ok: 200,
  config_error: 500,
  unauthorized: 401,
}

// Top-level browser navigation triggered by clicking "Connect LinkedIn" — no
// Authorization header available, so the caller's access token rides along as a
// query param instead. Verified against Supabase before it's trusted.
export async function connect(req: Request, res: Response) {
  const token = typeof req.query.token === 'string' ? req.query.token : null
  if (!token) {
    res.redirect(302, '/marketing?linkedin=error')
    return
  }

  const result = await startLinkedInConnect({ token })
  if (result.status !== 'ok') {
    res.redirect(302, '/marketing?linkedin=error')
    return
  }

  res.redirect(302, result.authorizationUrl)
}

export async function callback(req: Request, res: Response) {
  const { code, state, error } = req.query
  if (error || typeof code !== 'string' || typeof state !== 'string') {
    res.redirect(302, '/marketing?linkedin=error')
    return
  }

  const result = await handleLinkedInCallback({ code, state })
  res.redirect(302, result.status === 'ok' ? '/marketing?linkedin=connected' : '/marketing?linkedin=error')
}

export async function status(req: Request, res: Response) {
  const authHeader = req.headers.authorization ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    res.status(401).json({ error: 'Missing Authorization bearer token.' })
    return
  }

  const result = await getLinkedInStatus({ token })
  if (result.status === 'ok') {
    res.json({ connected: result.connected, expiresAt: result.expiresAt })
    return
  }

  res.status(STATUS_CODE[result.status]).json({ error: result.message })
}
