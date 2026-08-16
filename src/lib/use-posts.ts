import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed'

export type Post = {
  id: string
  project_id: string
  objective: string
  ai_variants: string[] | null
  content: string
  platform: string
  status: PostStatus
  scheduled_at: string | null
  published_at: string | null
  error_message: string | null
  created_at: string
}

export type PostInput = {
  objective: string
  ai_variants: string[]
  content: string
}

export function usePosts(projectId: string | null) {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!projectId) {
      setPosts([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setError(null)
    setPosts(data ?? [])
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function createPost(input: PostInput) {
    if (!projectId) return { error: 'No active project' }
    const { data, error } = await supabase
      .from('posts')
      .insert({
        project_id: projectId,
        objective: input.objective,
        ai_variants: input.ai_variants,
        content: input.content,
        status: 'draft',
      })
      .select()
      .single()
    if (error) return { error: error.message }
    setPosts((prev) => [data, ...prev])
    return { error: null }
  }

  async function schedulePost(id: string, scheduledAt: string) {
    const { data, error } = await supabase
      .from('posts')
      .update({ scheduled_at: scheduledAt, status: 'scheduled' })
      .eq('id', id)
      .select()
      .single()
    if (error) return { error: error.message }
    setPosts((prev) => prev.map((p) => (p.id === id ? data : p)))
    return { error: null }
  }

  async function unschedulePost(id: string) {
    const { data, error } = await supabase
      .from('posts')
      .update({ scheduled_at: null, status: 'draft' })
      .eq('id', id)
      .select()
      .single()
    if (error) return { error: error.message }
    setPosts((prev) => prev.map((p) => (p.id === id ? data : p)))
    return { error: null }
  }

  return { posts, loading, error, refresh, createPost, schedulePost, unschedulePost }
}
