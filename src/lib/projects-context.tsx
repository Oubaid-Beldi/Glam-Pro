import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

export type Project = {
  id: string
  owner_id: string
  name: string
  description: string | null
  created_at: string
}

const ACTIVE_PROJECT_KEY = 'glampro:active-project-id'

type ProjectsContextValue = {
  projects: Project[]
  loading: boolean
  error: string | null
  activeProject: Project | null
  setActiveProjectId: (id: string) => void
  createProject: (name: string, description: string) => Promise<{ error: string | null }>
  refresh: () => Promise<void>
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null)

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_PROJECT_KEY),
  )

  const refresh = useCallback(async () => {
    if (!user) {
      setProjects([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setError(null)
    setProjects(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (loading || projects.length === 0) return
    const stillExists = projects.some((p) => p.id === activeProjectId)
    if (!stillExists) {
      setActiveProjectId(projects[0].id)
    }
  }, [projects, activeProjectId, loading])

  function setActiveProjectId(id: string) {
    setActiveProjectIdState(id)
    localStorage.setItem(ACTIVE_PROJECT_KEY, id)
  }

  async function createProject(name: string, description: string) {
    if (!user) return { error: 'Not signed in' }
    const { data, error } = await supabase
      .from('projects')
      .insert({ owner_id: user.id, name, description: description || null })
      .select()
      .single()
    if (error) return { error: error.message }
    setProjects((prev) => [data, ...prev])
    setActiveProjectId(data.id)
    return { error: null }
  }

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null

  return (
    <ProjectsContext.Provider
      value={{
        projects,
        loading,
        error,
        activeProject,
        setActiveProjectId,
        createProject,
        refresh,
      }}
    >
      {children}
    </ProjectsContext.Provider>
  )
}

export function useProjects() {
  const ctx = useContext(ProjectsContext)
  if (!ctx) throw new Error('useProjects must be used within ProjectsProvider')
  return ctx
}
