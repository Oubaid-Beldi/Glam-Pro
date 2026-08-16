import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type Note = {
  id: string
  project_id: string
  title: string
  content: string | null
  created_at: string
}

export type NoteInput = {
  title: string
  content: string
}

export function useNotes(projectId: string | null) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!projectId) {
      setNotes([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setError(null)
    setNotes(data ?? [])
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function createNote(input: NoteInput) {
    if (!projectId) return { error: 'No active project' }
    const { data, error } = await supabase
      .from('notes')
      .insert({
        project_id: projectId,
        title: input.title,
        content: input.content || null,
      })
      .select()
      .single()
    if (error) return { error: error.message }
    setNotes((prev) => [data, ...prev])
    return { error: null }
  }

  async function updateNote(id: string, patch: Partial<NoteInput>) {
    const { data, error } = await supabase
      .from('notes')
      .update({
        ...patch,
        content: patch.content !== undefined ? patch.content || null : undefined,
      })
      .eq('id', id)
      .select()
      .single()
    if (error) return { error: error.message }
    setNotes((prev) => prev.map((n) => (n.id === id ? data : n)))
    return { error: null }
  }

  async function deleteNote(id: string) {
    const { error } = await supabase.from('notes').delete().eq('id', id)
    if (error) return { error: error.message }
    setNotes((prev) => prev.filter((n) => n.id !== id))
    return { error: null }
  }

  return { notes, loading, error, refresh, createNote, updateNote, deleteNote }
}
