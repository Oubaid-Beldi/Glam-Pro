import express from 'express'
import serverless from 'serverless-http'

const app = express()
app.use(express.json())

const router = express.Router()

router.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/api', router)

export const handler = serverless(app)
