import { Router } from 'express'
import { generatePosts } from '../controllers/posts.controller'

const router = Router()

router.post('/generate-posts', generatePosts)

export default router
