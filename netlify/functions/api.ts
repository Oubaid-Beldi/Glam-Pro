import express from 'express'
import serverless from 'serverless-http'
import healthRoutes from '../../server/routes/health.routes'
import postsRoutes from '../../server/routes/posts.routes'

const app = express()
app.use(express.json())

app.use('/api', healthRoutes)
app.use('/api', postsRoutes)

export const handler = serverless(app)
