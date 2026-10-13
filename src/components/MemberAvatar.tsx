import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { memberName, type ProjectMember } from '@/lib/use-project-members'
import { cn } from '@/lib/utils'

export function MemberAvatar({
  member,
  size = 'default',
  className,
}: {
  member: ProjectMember | undefined | null
  size?: 'default' | 'sm'
  className?: string
}) {
  const name = memberName(member)
  return (
    <Avatar size={size} className={className}>
      {member?.profiles?.avatar_url && (
        // Google avatar URLs reject requests that carry a cross-site referrer.
        <AvatarImage src={member.profiles.avatar_url} alt={name} referrerPolicy="no-referrer" />
      )}
      <AvatarFallback className="bg-primary text-primary-foreground">{name.charAt(0).toUpperCase()}</AvatarFallback>
    </Avatar>
  )
}

// "by <name>" attribution from a row's created_by. A creator who has since left the
// project isn't in the member list (and their profile is no longer readable under
// RLS), so they show as "a former member" rather than nothing.
export function Byline({
  createdBy,
  membersById,
  className,
}: {
  createdBy: string | null
  membersById: Map<string, ProjectMember>
  className?: string
}) {
  if (!createdBy) return null
  const member = membersById.get(createdBy)
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground', className)}>
      {member && <MemberAvatar member={member} size="sm" />}
      <span className="truncate">by {member ? memberName(member) : 'a former member'}</span>
    </span>
  )
}
