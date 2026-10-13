import type { Request, Response } from 'express'
import { z } from 'zod'
import {
  claimInvitations,
  inviteMember,
  removeMember,
  revokeInvitation,
  type MembersFailure,
} from '../services/members.service'
import type { ClaimResponseBody, InviteResponseBody } from '../types/members.types'

const STATUS_CODE: Record<MembersFailure['status'], number> = {
  config_error: 500,
  bad_request: 400,
  not_found: 404,
  forbidden: 403,
  conflict: 409,
  db_error: 500,
}

const projectParamsSchema = z.object({ projectId: z.uuid() })
const invitationParamsSchema = z.object({ projectId: z.uuid(), invitationId: z.uuid() })
const memberParamsSchema = z.object({ projectId: z.uuid(), userId: z.uuid() })
const inviteBodySchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()) })

function sendFailure(res: Response, failure: MembersFailure) {
  res.status(STATUS_CODE[failure.status]).json({ error: failure.message })
}

// requireAuth runs before every handler here, so authUser is always set; the
// check just keeps the types honest.
function getCaller(req: Request, res: Response) {
  if (!req.authUser) {
    res.status(401).json({ error: 'Missing Authorization bearer token.' })
    return null
  }
  return req.authUser
}

export async function invite(req: Request, res: Response) {
  const caller = getCaller(req, res)
  if (!caller) return

  const params = projectParamsSchema.safeParse(req.params)
  if (!params.success) {
    res.status(400).json({ error: 'Invalid project id.' })
    return
  }
  const body = inviteBodySchema.safeParse(req.body ?? {})
  if (!body.success) {
    res.status(400).json({ error: 'A valid email address is required.' })
    return
  }

  const result = await inviteMember({ caller, projectId: params.data.projectId, email: body.data.email })
  if (result.status !== 'ok') {
    sendFailure(res, result)
    return
  }
  res.json(result.outcome satisfies InviteResponseBody)
}

export async function revoke(req: Request, res: Response) {
  const caller = getCaller(req, res)
  if (!caller) return

  const params = invitationParamsSchema.safeParse(req.params)
  if (!params.success) {
    res.status(400).json({ error: 'Invalid project or invitation id.' })
    return
  }

  const result = await revokeInvitation({ caller, ...params.data })
  if (result.status !== 'ok') {
    sendFailure(res, result)
    return
  }
  res.status(204).end()
}

export async function remove(req: Request, res: Response) {
  const caller = getCaller(req, res)
  if (!caller) return

  const params = memberParamsSchema.safeParse(req.params)
  if (!params.success) {
    res.status(400).json({ error: 'Invalid project or user id.' })
    return
  }

  const result = await removeMember({ caller, ...params.data })
  if (result.status !== 'ok') {
    sendFailure(res, result)
    return
  }
  res.status(204).end()
}

export async function claim(req: Request, res: Response) {
  const caller = getCaller(req, res)
  if (!caller) return

  const result = await claimInvitations({ caller })
  if (result.status !== 'ok') {
    sendFailure(res, result)
    return
  }
  res.json({ joined: result.joined } satisfies ClaimResponseBody)
}
