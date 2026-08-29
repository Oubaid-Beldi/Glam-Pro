import type { Request, Response } from 'express'
import { transcribeObjectiveAudio, type TranscribeResult } from '../services/voice.service'

const STATUS_CODE: Record<TranscribeResult['status'], number> = {
  ok: 200,
  config_error: 500,
  unauthorized: 401,
  bad_request: 400,
  timeout: 504,
  provider_unreachable: 502,
  rate_limited: 429,
  bad_response: 502,
}

export async function transcribe(req: Request, res: Response) {
  const authHeader = req.headers.authorization ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    res.status(401).json({ error: 'Missing Authorization bearer token.' })
    return
  }

  const { audioBase64, mimeType } = req.body ?? {}
  if (typeof audioBase64 !== 'string' || !audioBase64 || typeof mimeType !== 'string' || !mimeType) {
    res.status(400).json({ error: 'audioBase64 and mimeType are required.' })
    return
  }

  const audio = Buffer.from(audioBase64, 'base64')
  const result = await transcribeObjectiveAudio({ token, audio, mimeType })

  if (result.status === 'ok') {
    res.json({ transcript: result.transcript })
    return
  }

  res.status(STATUS_CODE[result.status]).json({ error: result.message })
}
