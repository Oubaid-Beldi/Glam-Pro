import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type TaskStatus = 'todo' | 'doing' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high'

export type Task = {
  id: string
  project_id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  // Legacy free-text assignee from before collaboration. Never written anymore —
  // shown read-only on tasks that don't have a real assignee_id yet.
  assignee: string | null
  assignee_id: string | null
  due_date: string | null
  created_by: string | null
  created_at: string
}

export type TaskInput = {
  title: string
  status: TaskStatus
  priority: TaskPriority
  assignee_id: string // '' = unassigned
  due_date: string
}

export function useTasks(projectId: string | null) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!projectId) {
      setTasks([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setError(null)
    setTasks(data ?? [])
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function createTask(input: TaskInput) {
    if (!projectId) return { error: 'No active project' }
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        project_id: projectId,
        title: input.title,
        status: input.status,
        priority: input.priority,
        assignee_id: input.assignee_id || null,
        due_date: input.due_date || null,
      })
      .select()
      .single()
    if (error) return { error: error.message }
    setTasks((prev) => [data, ...prev])
    return { error: null }
  }

  async function updateTask(id: string, patch: Partial<TaskInput>) {
    const { data, error } = await supabase
      .from('tasks')
      .update({
        ...patch,
        assignee_id: patch.assignee_id !== undefined ? patch.assignee_id || null : undefined,
        due_date: patch.due_date !== undefined ? patch.due_date || null : undefined,
      })
      .eq('id', id)
      .select()
      .single()
    if (error) return { error: error.message }
    setTasks((prev) => prev.map((t) => (t.id === id ? data : t)))
    return { error: null }
  }

  async function deleteTask(id: string) {
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) return { error: error.message }
    setTasks((prev) => prev.filter((t) => t.id !== id))
    return { error: null }
  }

  return { tasks, loading, error, refresh, createTask, updateTask, deleteTask }
}
