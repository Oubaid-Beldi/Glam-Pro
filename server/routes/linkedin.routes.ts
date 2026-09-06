import { Router } from 'express'
import { connect, callback, status } from '../controllers/linkedin.controller'

const router = Router()

// Absolute paths, mounted at the app root (not under a single /api or /auth prefix
// like the other route files) because this router genuinely serves two different
// public prefixes: /auth/linkedin/* for the OAuth redirect hops (top-level browser
// navigations) and /api/linkedin/status for the authenticated fetch() from Marketing.
router.get('/auth/linkedin/connect', connect)
router.get('/auth/linkedin/callback', callback)
router.get('/api/linkedin/status', status)

export default router
