import { Router } from 'express'
import { transcribe } from '../controllers/voice.controller'

const router = Router()

router.post('/posts/transcribe', transcribe)

export default router
