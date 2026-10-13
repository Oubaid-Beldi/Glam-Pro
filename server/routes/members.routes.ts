import { Router } from 'express'
import { requireAuth } from '../middleware/require-auth'
import { claim, invite, remove, revoke } from '../controllers/members.controller'

const router = Router()

// Writes only. Reads (member list, pending invitations) are direct Supabase
// queries from React, scoped by RLS.
router.post('/projects/:projectId/invitations', requireAuth, invite)
router.delete('/projects/:projectId/invitations/:invitationId', requireAuth, revoke)
router.delete('/projects/:projectId/members/:userId', requireAuth, remove)
router.post('/invitations/claim', requireAuth, claim)

export default router
