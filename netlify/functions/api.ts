import express from 'express'
import serverless from 'serverless-http'
import healthRoutes from '../../server/routes/health.routes'
import postsRoutes from '../../server/routes/posts.routes'
import voiceRoutes from '../../server/routes/voice.routes'
import linkedinRoutes from '../../server/routes/linkedin.routes'

const app = express()
// Default 100kb JSON limit is too small for a base64-encoded audio recording
// (session 8's voice input sends up to ~60s of webm as a JSON string field).
app.use(express.json({ limit: '10mb' }))

app.use('/api', healthRoutes)
app.use('/api', postsRoutes)
app.use('/api', voiceRoutes)
// linkedinRoutes defines its own absolute paths (/auth/linkedin/*, /api/linkedin/status)
// rather than a single shared prefix, so it's mounted at the app root.
app.use(linkedinRoutes)

export const handler = serverless(app)
