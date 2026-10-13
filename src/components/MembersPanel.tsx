import { useState, type FormEvent } from 'react'
import { Loader2, LogOut, Mail, UserMinus, UserPlus, Users, X } from 'lucide-react'
import { MemberAvatar } from '@/components/MemberAvatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth-context'
import { formatDate } from '@/lib/post-format'
import { useProjects, type Project } from '@/lib/projects-context'
import { memberName, useProjectMembers } from '@/lib/use-project-members'
import { cn } from '@/lib/utils'

export function MembersPanel({ project }: { project: Project }) {
  const { user } = useAuth()
  const { refresh: refreshProjects } = useProjects()
  const isOwner = project.my_role === 'owner'
  const { members, invitations, loading, error, invite, revokeInvitation, removeMember } = useProjectMembers(
    project.id,
    isOwner,
  )
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function handleInvite(e: FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return
    setInviting(true)
    setNotice(null)
    const { error, outcome } = await invite(trimmed)
    setInviting(false)
    if (error || !outcome) {
      setNotice({ tone: 'error', text: error ?? 'Invite failed.' })
      return
    }
    setEmail('')
    setNotice(
      outcome.kind === 'added'
        ? { tone: 'success', text: `${outcome.member.name ?? outcome.member.email} was added to the project.` }
        : {
            tone: 'success',
            text: `Invitation saved. Ask them to sign in with Google as ${outcome.invitation.email} — they'll join automatically.`,
          },
    )
  }

  async function handleRevoke(invitationId: string, invitedEmail: string) {
    if (!window.confirm(`Revoke the invitation for ${invitedEmail}?`)) return
    setBusyId(invitationId)
    const { error } = await revokeInvitation(invitationId)
    setBusyId(null)
    setNotice(error ? { tone: 'error', text: error } : null)
  }

  async function handleRemove(userId: string, label: string) {
    if (!window.confirm(`Remove ${label} from "${project.name}"? They'll lose access immediately.`)) return
    setBusyId(userId)
    const { error } = await removeMember(userId)
    setBusyId(null)
    setNotice(error ? { tone: 'error', text: error } : null)
  }

  async function handleLeave() {
    if (!user) return
    if (!window.confirm(`Leave "${project.name}"? You'll lose access until the owner invites you again.`)) return
    setBusyId(user.id)
    const { error } = await removeMember(user.id)
    setBusyId(null)
    if (error) {
      setNotice({ tone: 'error', text: error })
      return
    }
    await refreshProjects()
  }

  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex min-w-0 items-center gap-2 text-base">
          <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">Team · {project.name}</span>
        </CardTitle>
        {!loading && (
          <span className="text-sm text-muted-foreground">
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </span>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isOwner && (
          <form onSubmit={handleInvite} className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">Invite by email</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="invite-email"
                type="email"
                className="h-11 md:h-9"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@example.com"
                autoComplete="off"
              />
              <Button type="submit" disabled={inviting || !email.trim()} className="h-11 shrink-0 md:h-9">
                {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Invite
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              No email is sent. Tell your teammate to sign in with the Google account for this address.
            </p>
          </form>
        )}

        {notice && (
          <p className={cn('text-sm', notice.tone === 'success' ? 'text-success' : 'text-destructive')}>
            {notice.text}
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading team…
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {members.map((member) => {
              const name = memberName(member)
              const isMe = member.user_id === user?.id
              const canRemove = isOwner && member.role !== 'owner'
              return (
                <li key={member.user_id} className="flex items-center gap-3 py-2">
                  <MemberAvatar member={member} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">
                      {name}
                      {isMe && <span className="font-normal text-muted-foreground"> (you)</span>}
                    </span>
                    {member.profiles?.email && (
                      <span className="truncate text-xs text-muted-foreground">{member.profiles.email}</span>
                    )}
                  </div>
                  <Badge
                    className={cn(
                      'border-transparent',
                      member.role === 'owner' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {member.role === 'owner' ? 'Owner' : 'Member'}
                  </Badge>
                  {canRemove && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${name}`}
                      disabled={busyId === member.user_id}
                      onClick={() => handleRemove(member.user_id, name)}
                      className="size-11 shrink-0 text-muted-foreground hover:text-destructive md:size-8"
                    >
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {isOwner && invitations.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">Pending invitations</h3>
            <ul className="flex flex-col divide-y divide-border">
              {invitations.map((invitation) => (
                <li key={invitation.id} className="flex items-center gap-3 py-2">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-foreground">{invitation.email}</span>
                    <span className="text-xs text-muted-foreground">Invited {formatDate(invitation.created_at)}</span>
                  </div>
                  <Badge className="border-transparent bg-warning/10 text-warning">Pending</Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Revoke invitation for ${invitation.email}`}
                    disabled={busyId === invitation.id}
                    onClick={() => handleRevoke(invitation.id, invitation.email)}
                    className="size-11 shrink-0 text-muted-foreground hover:text-destructive md:size-8"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!isOwner && (
          <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Owned by {project.owner_name ?? 'another user'}. You can work on everything in this project.
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={busyId === user?.id}
              onClick={handleLeave}
              className="h-11 shrink-0 self-start text-destructive hover:text-destructive md:h-8 sm:self-auto"
            >
              <LogOut className="h-4 w-4" />
              Leave project
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
