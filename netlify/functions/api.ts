import express from 'express'
import serverless from 'serverless-http'
import healthRoutes from '../../server/routes/health.routes'
import postsRoutes from '../../server/routes/posts.routes'
import voiceRoutes from '../../server/routes/voice.routes'

const app = express()
// Default 100kb JSON limit is too small for a base64-encoded audio recording
// (session 8's voice input sends up to ~60s of webm as a JSON string field).
app.use(express.json({ limit: '10mb' }))

app.use('/api', healthRoutes)
app.use('/api', postsRoutes)
app.use('/api', voiceRoutes)

export const handler = serverless(app)
