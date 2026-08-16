import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Calendar as CalendarIcon, FolderKanban, Megaphone } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useProjects } from '@/lib/projects-context'
import { usePosts, type Post, type PostStatus } from '@/lib/use-posts'
import { STATUS_LABEL, STATUS_BADGE_CLASS, formatDate, formatDateTime } from '@/lib/post-format'
import { cn } from '@/lib/utils'

type Section = {
  status: PostStatus
  title: string
  emptyLabel: string
  dateLabel: string
  dateOf: (post: Post) => string | null
  compare: (a: Post, b: Post) => number
}

const SECTIONS: Section[] = [
  {
    status: 'scheduled',
    title: 'Scheduled — upcoming',
    emptyLabel: 'Nothing scheduled',
    dateLabel: 'Scheduled for',
    dateOf: (p) => p.scheduled_at,
    compare: (a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''),
  },
  {
    status: 'published',
    title: 'Published',
    emptyLabel: 'Nothing published yet',
    dateLabel: 'Published',
    dateOf: (p) => p.published_at,
    compare: (a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''),
  },
  {
    status: 'draft',
    title: 'Pending — not yet scheduled',
    emptyLabel: 'Nothing pending',
    dateLabel: 'Created',
    dateOf: (p) => p.created_at,
    compare: (a, b) => b.created_at.localeCompare(a.created_at),
  },
  {
    status: 'failed',
    title: 'Failed',
    emptyLabel: 'No failed posts',
    dateLabel: 'Created',
    dateOf: (p) => p.created_at,
    compare: (a, b) => b.created_at.localeCompare(a.created_at),
  },
]

export default function Calendar() {
  const { activeProject, loading: projectsLoading } = useProjects()
  const { posts, loading, error } = usePosts(activeProject?.id ?? null)

  const grouped = useMemo(() => {
    const byStatus = new Map<PostStatus, Post[]>()
    for (const section of SECTIONS) byStatus.set(section.status, [])
    for (const post of posts) byStatus.get(post.status)?.push(post)
    for (const section of SECTIONS) byStatus.get(section.status)?.sort(section.compare)
    return byStatus
  }, [posts])

  if (!projectsLoading && !activeProject) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            See scheduled, published, pending, and failed posts by date.
          </p>
        </div>
        <div className="flex min-h-96 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card p-12 text-center shadow-sm">
          <FolderKanban className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No active project</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Create or select a project first — posts belong to a project.
          </p>
          <Link to="/projects" className={cn(buttonVariants(), 'mt-1 h-11 md:h-8')}>
            Go to projects
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Calendar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {activeProject ? (
            <>
              Post status for{' '}
              <span className="font-medium text-foreground">{activeProject.name}</span>
            </>
          ) : (
            'See scheduled, published, pending, and failed posts by date.'
          )}
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && posts.length === 0 && (
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card p-12 text-center shadow-sm">
          <Megaphone className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No posts yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Generate and save a draft in Marketing, then schedule it to see it here.
          </p>
          <Link to="/marketing" className={cn(buttonVariants(), 'mt-1 h-11 md:h-8')}>
            Go to Marketing
          </Link>
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading posts…</p>}

      {!loading &&
        posts.length > 0 &&
        SECTIONS.map((section) => {
          const sectionPosts = grouped.get(section.status) ?? []
          return (
            <div key={section.status} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium text-foreground">{section.title}</h2>
                <Badge className={cn('border-transparent', STATUS_BADGE_CLASS[section.status])}>
                  {sectionPosts.length}
                </Badge>
              </div>

              {sectionPosts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{section.emptyLabel}</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {sectionPosts.map((post) => {
                    const date = section.dateOf(post)
                    return (
                      <Card key={post.id} className="rounded-xl shadow-sm">
                        <CardContent className="flex flex-col gap-1.5 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-foreground wrap-break-word">
                              {post.objective}
                            </p>
                            <Badge
                              className={cn('border-transparent', STATUS_BADGE_CLASS[post.status])}
                            >
                              {STATUS_LABEL[post.status]}
                            </Badge>
                            <Badge variant="outline" className="capitalize">
                              {post.platform}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {section.dateLabel}{' '}
                            {date
                              ? section.status === 'draft' || section.status === 'failed'
                                ? formatDate(date)
                                : formatDateTime(date)
                              : '—'}
                          </p>
                          <p className="whitespace-pre-wrap text-sm text-muted-foreground wrap-break-word">
                            {post.content}
                          </p>
                          {post.status === 'failed' && post.error_message && (
                            <p className="text-sm text-destructive">{post.error_message}</p>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
    </div>
  )
}
