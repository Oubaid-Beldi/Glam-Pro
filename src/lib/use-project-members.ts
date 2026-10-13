import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/api'
import type { MemberRole } from '@/lib/projects-context'

export type ProjectMember = {
  user_id: string
  role: MemberRole
  created_at: string
  profiles: { id: string; email: string | null; name: string | null; avatar_url: string | null } | null
}

export type PendingInvitation = {
  id: string
  email: string
  created_at: string
}

type InviteOutcome =
  | { kind: 'added'; member: { userId: string; email: string | null; name: string | null } }
  | { kind: 'invited'; invitation: PendingInvitation }

// Reads are direct RLS-scoped Supabase queries (members can read their project's
// member list; only the owner can read its invitations). Writes go through the
// backend, which looks users up by email — something the client can't do under RLS.
export function useProjectMembers(projectId: string | null, isOwner: boolean) {
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [invitations, setInvitations] = useState<PendingInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!projectId) {
      setMembers([])
      setInvitations([])
      setLoading(false)
      return
    }
    setLoading(true)
    const [membersRes, invitationsRes] = await Promise.all([
      supabase
        .from('project_members')
        .select('user_id, role, created_at, profiles(id, email, name, avatar_url)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true }),
      isOwner
        ? supabase
            .from('project_invitations')
            .select('id, email, created_at')
            .eq('project_id', projectId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ])
    const firstError = membersRes.error ?? invitationsRes.error
    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }
    setError(null)
    setMembers((membersRes.data ?? []) as unknown as ProjectMember[])
    setInvitations((invitationsRes.data ?? []) as PendingInvitation[])
    setLoading(false)
  }, [projectId, isOwner])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function invite(email: string) {
    if (!projectId) return { error: 'No active project', outcome: null }
    const { data, error } = await apiFetch<InviteOutcome>(`/api/projects/${projectId}/invitations`, {
      method: 'POST',
      body: { email },
    })
    if (error || !data) return { error: error ?? 'Invite failed.', outcome: null }
    await refresh()
    return { error: null, outcome: data }
  }

  async function revokeInvitation(invitationId: string) {
    if (!projectId) return { error: 'No active project' }
    const { error } = await apiFetch(`/api/projects/${projectId}/invitations/${invitationId}`, {
      method: 'DELETE',
    })
    if (error) return { error }
    setInvitations((prev) => prev.filter((i) => i.id !== invitationId))
    return { error: null }
  }

  // Used both for the owner removing someone and for a member leaving.
  async function removeMember(userId: string) {
    if (!projectId) return { error: 'No active project' }
    const { error } = await apiFetch(`/api/projects/${projectId}/members/${userId}`, { method: 'DELETE' })
    if (error) return { error }
    setMembers((prev) => prev.filter((m) => m.user_id !== userId))
    return { error: null }
  }

  return { members, invitations, loading, error, refresh, invite, revokeInvitation, removeMember }
}
