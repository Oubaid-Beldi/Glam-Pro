import type { NextFunction, Request, Response } from 'express'
import { verifyAccessToken, type VerifyAccessTokenResult } from '../services/auth.service'
import '../types/auth.types'

const STATUS_CODE: Record<Exclude<VerifyAccessTokenResult['status'], 'ok'>, number> = {
  config_error: 500,
  unauthorized: 401,
}

// Verifies the Supabase access token from `Authorization: Bearer <token>` and
// attaches the caller as req.authUser. There's no shared Express error handler in
// this app, so failures respond directly in the same { error } shape every
// controller already uses.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    res.status(401).json({ error: 'Missing Authorization bearer token.' })
    return
  }

  const result = await verifyAccessToken(token)
  if (result.status !== 'ok') {
    res.status(STATUS_CODE[result.status]).json({ error: result.message })
    return
  }

  req.authUser = result.user
  next()
}
