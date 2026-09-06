import { Link } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderKanban,
  ListChecks,
  Circle,
  CircleDot,
  CheckCircle2,
  StickyNote,
  FileEdit,
  CalendarClock,
  Send,
  XCircle,
  Loader2,
  type LucideIcon,
} from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useProjects } from '@/lib/projects-context'
import { useTasks } from '@/lib/use-tasks'
import { useNotes } from '@/lib/use-notes'
import { usePosts } from '@/lib/use-posts'
import { STATUS_LABEL, formatDateTime } from '@/lib/post-format'
import { cn } from '@/lib/utils'

export default function Dashboard() {
  const { activeProject, loading: projectsLoading } = useProjects()
  const projectId = activeProject?.id ?? null

  const { tasks, loading: tasksLoading } = useTasks(projectId)
  const { notes, loading: notesLoading } = useNotes(projectId)
  const { posts, loading: postsLoading } = usePosts(projectId)

  const loading = tasksLoading || notesLoading || postsLoading

  const taskCounts = {
    todo: tasks.filter((t) => t.status === 'todo').length,
    doing: tasks.filter((t) => t.status === 'doing').length,
    done: tasks.filter((t) => t.status === 'done').length,
  }

  const postCounts = {
    draft: posts.filter((p) => p.status === 'draft').length,
    scheduled: posts.filter((p) => p.status === 'scheduled').length,
    published: posts.filter((p) => p.status === 'published').length,
    failed: posts.filter((p) => p.status === 'failed').length,
  }

  const upcoming = posts
    .filter((p) => p.status === 'scheduled' && p.scheduled_at)
    .sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
    .slice(0, 5)

  const isEmptyProject =
    !loading && tasks.length === 0 && notes.length === 0 && posts.length === 0

  if (!projectsLoading && !activeProject) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            An overview of your projects, tasks, and marketing activity.
          </p>
        </div>
        <div className="flex min-h-96 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card p-12 text-center shadow-sm">
          <FolderKanban className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No active project</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Create or select a project first — the dashboard is scoped to a project.
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
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {activeProject ? (
            <>
              Overview for <span className="font-medium text-foreground">{activeProject.name}</span>
            </>
          ) : (
            'An overview of your projects, tasks, and marketing activity.'
          )}
        </p>
      </div>

      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading dashboard…
        </p>
      )}

      {isEmptyProject && (
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card p-12 text-center shadow-sm">
          <LayoutDashboard className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Nothing here yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            This project doesn't have any tasks, notes, or posts yet. Add some from the sidebar to
            see them summarized here.
          </p>
        </div>
      )}

      {!loading && !isEmptyProject && (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ListChecks className="h-4 w-4" />
              Tasks
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label="To do"
                value={taskCounts.todo}
                icon={Circle}
                colorClass="text-muted-foreground"
                bgClass="bg-muted"
              />
              <StatCard
                label="Doing"
                value={taskCounts.doing}
                icon={CircleDot}
                colorClass="text-info"
                bgClass="bg-info/10"
              />
              <StatCard
                label="Done"
                value={taskCounts.done}
                icon={CheckCircle2}
                colorClass="text-success"
                bgClass="bg-success/10"
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <StickyNote className="h-4 w-4" />
              Notes
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Total notes"
                value={notes.length}
                icon={StickyNote}
                colorClass="text-foreground"
                bgClass="bg-muted"
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Send className="h-4 w-4" />
              Posts
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label={STATUS_LABEL.draft}
                value={postCounts.draft}
                icon={FileEdit}
                colorClass="text-warning"
                bgClass="bg-warning/10"
              />
              <StatCard
                label={STATUS_LABEL.scheduled}
                value={postCounts.scheduled}
                icon={CalendarClock}
                colorClass="text-info"
                bgClass="bg-info/10"
              />
              <StatCard
                label={STATUS_LABEL.published}
                value={postCounts.published}
                icon={Send}
                colorClass="text-success"
                bgClass="bg-success/10"
              />
              <StatCard
                label={STATUS_LABEL.failed}
                value={postCounts.failed}
                icon={XCircle}
                colorClass="text-destructive"
                bgClass="bg-destructive/10"
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CalendarClock className="h-4 w-4" />
              Upcoming scheduled posts
            </h2>

            {upcoming.length === 0 ? (
              <Card className="rounded-xl shadow-sm">
                <CardContent className="flex flex-col items-center justify-center gap-2 p-8 text-center">
                  <p className="text-sm font-medium text-foreground">Nothing scheduled</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Schedule a post from Marketing to see it show up here.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-3">
                {upcoming.map((post) => (
                  <Card key={post.id} className="rounded-xl shadow-sm">
                    <CardContent className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {post.content || post.objective}
                      </p>
                      <p className="shrink-0 text-xs text-muted-foreground">
                        {post.scheduled_at ? formatDateTime(post.scheduled_at) : '—'}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  colorClass,
  bgClass,
}: {
  label: string
  value: number
  icon: LucideIcon
  colorClass: string
  bgClass: string
}) {
  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', bgClass)}>
          <Icon className={cn('h-4 w-4', colorClass)} />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold text-foreground">{value}</p>
      </CardContent>
    </Card>
  )
}
