import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { apiFetch } from '@/lib/api'

export type MemberRole = 'owner' | 'member'

export type Project = {
  id: string
  owner_id: string
  name: string
  description: string | null
  created_at: string
  // From project_members, not projects.owner_id — membership is the single source
  // of truth for who can do what. Used only to show/hide owner-only UI; the real
  // enforcement is RLS + the backend's checks.
  my_role: MemberRole
  owner_name: string | null
}

type ProjectRow = Omit<Project, 'my_role' | 'owner_name'> & {
  project_members: { user_id: string; role: MemberRole; profiles: { name: string | null; email: string | null } | null }[]
}

const PROJECT_SELECT = '*, project_members(user_id, role, profiles(name, email))'

function toProject(row: ProjectRow, userId: string): Project {
  const { project_members: members, ...project } = row
  const mine = members.find((m) => m.user_id === userId)
  const owner = members.find((m) => m.role === 'owner')
  return {
    ...project,
    my_role: mine?.role ?? 'member',
    owner_name: owner?.profiles?.name ?? owner?.profiles?.email ?? null,
  }
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
  const claimedForUserId = useRef<string | null>(null)

  // No owner_id filter: RLS returns every project the caller is a member of.
  const refresh = useCallback(async () => {
    if (!user) {
      setProjects([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('projects')
      .select(PROJECT_SELECT)
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setError(null)
    setProjects(((data ?? []) as ProjectRow[]).map((row) => toProject(row, user.id)))
    setLoading(false)
  }, [user])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Once per app load per signed-in user: turn any pending invitations for this
  // user's verified email into memberships, then show the newly joined projects.
  useEffect(() => {
    if (!user || claimedForUserId.current === user.id) return
    claimedForUserId.current = user.id
    apiFetch<{ joined: { projectId: string; projectName: string }[] }>('/api/invitations/claim', {
      method: 'POST',
    }).then(async ({ data, error }) => {
      if (error) {
        console.error('claim invitations failed:', error)
        return
      }
      if (!data || data.joined.length === 0) return
      await refresh()
      for (const joined of data.joined) {
        toast.success(`You've been added to ${joined.projectName}`)
      }
    })
  }, [user, refresh])

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
    // Insert and read back in two statements, not insert().select(). Visibility is
    // membership-based, and the creator's owner membership row is written by an
    // AFTER INSERT trigger — Postgres checks RETURNING against the SELECT policy
    // before that trigger has run, so a single insert-returning call is rejected.
    const id = crypto.randomUUID()
    const { error: insertError } = await supabase
      .from('projects')
      .insert({ id, owner_id: user.id, name, description: description || null })
    if (insertError) return { error: insertError.message }
    const { data, error } = await supabase.from('projects').select(PROJECT_SELECT).eq('id', id).single()
    if (error) return { error: error.message }
    setProjects((prev) => [toProject(data as ProjectRow, user.id), ...prev])
    setActiveProjectId(id)
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
