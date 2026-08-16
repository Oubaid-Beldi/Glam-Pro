import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ListChecks, FolderKanban, Pencil, Trash2, Check, X, User, CalendarDays } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useProjects } from '@/lib/projects-context'
import { useTasks, type Task, type TaskInput, type TaskPriority, type TaskStatus } from '@/lib/use-tasks'
import { cn } from '@/lib/utils'

const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'To do', doing: 'Doing', done: 'Done' }
const PRIORITY_LABEL: Record<TaskPriority, string> = { low: 'Low', medium: 'Medium', high: 'High' }

const STATUS_BADGE_CLASS: Record<TaskStatus, string> = {
  todo: 'bg-muted text-muted-foreground',
  doing: 'bg-info/10 text-info',
  done: 'bg-success/10 text-success',
}

const PRIORITY_BADGE_CLASS: Record<TaskPriority, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-warning/10 text-warning',
  high: 'bg-destructive/10 text-destructive',
}

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 3, medium: 2, low: 1 }

type SortKey = 'newest' | 'due_date' | 'priority'

const EMPTY_FORM: TaskInput = { title: '', status: 'todo', priority: 'medium', assignee: '', due_date: '' }

function formatDate(value: string | null) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Tasks() {
  const { activeProject, loading: projectsLoading } = useProjects()
  const { tasks, loading, error, createTask, updateTask, deleteTask } = useTasks(
    activeProject?.id ?? null,
  )

  const [form, setForm] = useState<TaskInput>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('newest')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<TaskInput>(EMPTY_FORM)
  const [editError, setEditError] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const visibleTasks = useMemo(() => {
    const filtered = tasks.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
      return true
    })

    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === 'priority') return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]
      if (sortKey === 'due_date') {
        if (!a.due_date && !b.due_date) return 0
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return a.due_date.localeCompare(b.due_date)
      }
      return b.created_at.localeCompare(a.created_at)
    })

    return sorted
  }, [tasks, statusFilter, priorityFilter, sortKey])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSubmitting(true)
    setFormError(null)
    const { error } = await createTask({ ...form, title: form.title.trim() })
    setSubmitting(false)
    if (error) {
      setFormError(error)
      return
    }
    setForm(EMPTY_FORM)
  }

  function startEdit(task: Task) {
    setEditingId(task.id)
    setEditError(null)
    setEditForm({
      title: task.title,
      status: task.status,
      priority: task.priority,
      assignee: task.assignee ?? '',
      due_date: task.due_date ?? '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditError(null)
  }

  async function saveEdit(id: string) {
    if (!editForm.title.trim()) return
    setSavingEdit(true)
    setEditError(null)
    const { error } = await updateTask(id, { ...editForm, title: editForm.title.trim() })
    setSavingEdit(false)
    if (error) {
      setEditError(error)
      return
    }
    setEditingId(null)
  }

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`Delete task "${title}"? This can't be undone.`)) return
    await deleteTask(id)
  }

  if (!projectsLoading && !activeProject) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Tasks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track work by status and priority within the selected project.
          </p>
        </div>
        <div className="flex min-h-96 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card p-12 text-center shadow-sm">
          <FolderKanban className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No active project</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Create or select a project first — tasks belong to a project.
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
        <h1 className="text-2xl font-semibold text-foreground">Tasks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {activeProject ? (
            <>
              Tasks for <span className="font-medium text-foreground">{activeProject.name}</span>
            </>
          ) : (
            'Track work by status and priority within the selected project.'
          )}
        </p>
      </div>

      <Card className="rounded-xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">New task</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-title">Title</Label>
              <Input
                id="task-title"
                className="h-11 md:h-9"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Write Q3 campaign brief"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) => setForm((f) => ({ ...f, status: value as TaskStatus }))}
                >
                  <SelectTrigger className="h-11 w-full md:h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(value) =>
                    setForm((f) => ({ ...f, priority: value as TaskPriority }))
                  }
                >
                  <SelectTrigger className="h-11 w-full md:h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORITY_LABEL[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="task-assignee">Assignee</Label>
                <Input
                  id="task-assignee"
                  className="h-11 md:h-9"
                  value={form.assignee}
                  onChange={(e) => setForm((f) => ({ ...f, assignee: e.target.value }))}
                  placeholder="Optional"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="task-due-date">Due date</Label>
                <Input
                  id="task-due-date"
                  type="date"
                  className="h-11 md:h-9"
                  value={form.due_date}
                  onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                />
              </div>
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <Button
              type="submit"
              disabled={submitting || !form.title.trim()}
              className="h-11 self-start md:h-8"
            >
              {submitting ? 'Adding…' : 'Add task'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            {loading ? 'Loading tasks…' : `${visibleTasks.length} of ${tasks.length} task${tasks.length === 1 ? '' : 's'}`}
          </h2>

          <div className="flex flex-wrap gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TaskStatus | 'all')}>
              <SelectTrigger className="h-11 md:h-8" size="sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={priorityFilter}
              onValueChange={(v) => setPriorityFilter(v as TaskPriority | 'all')}
            >
              <SelectTrigger className="h-11 md:h-8" size="sm">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="h-11 md:h-8" size="sm">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="due_date">Due date</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {!loading && tasks.length === 0 && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card p-12 text-center shadow-sm">
            <ListChecks className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No tasks yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Add your first task above to start tracking work for this project.
            </p>
          </div>
        )}

        {!loading && tasks.length > 0 && visibleTasks.length === 0 && (
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card p-8 text-center shadow-sm">
            <p className="text-sm font-medium text-foreground">No tasks match these filters</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {visibleTasks.map((task) => {
            const isEditing = editingId === task.id
            const dueDateLabel = formatDate(task.due_date)

            if (isEditing) {
              return (
                <Card key={task.id} className="rounded-xl shadow-sm ring-1 ring-ring">
                  <CardContent className="flex flex-col gap-4 p-4">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`edit-title-${task.id}`}>Title</Label>
                      <Input
                        id={`edit-title-${task.id}`}
                        className="h-11 md:h-9"
                        value={editForm.title}
                        onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="flex flex-col gap-1.5">
                        <Label>Status</Label>
                        <Select
                          value={editForm.status}
                          onValueChange={(value) =>
                            setEditForm((f) => ({ ...f, status: value as TaskStatus }))
                          }
                        >
                          <SelectTrigger className="h-11 w-full md:h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
                              <SelectItem key={s} value={s}>
                                {STATUS_LABEL[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label>Priority</Label>
                        <Select
                          value={editForm.priority}
                          onValueChange={(value) =>
                            setEditForm((f) => ({ ...f, priority: value as TaskPriority }))
                          }
                        >
                          <SelectTrigger className="h-11 w-full md:h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
                              <SelectItem key={p} value={p}>
                                {PRIORITY_LABEL[p]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`edit-assignee-${task.id}`}>Assignee</Label>
                        <Input
                          id={`edit-assignee-${task.id}`}
                          className="h-11 md:h-9"
                          value={editForm.assignee}
                          onChange={(e) => setEditForm((f) => ({ ...f, assignee: e.target.value }))}
                          placeholder="Optional"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`edit-due-${task.id}`}>Due date</Label>
                        <Input
                          id={`edit-due-${task.id}`}
                          type="date"
                          className="h-11 md:h-9"
                          value={editForm.due_date}
                          onChange={(e) => setEditForm((f) => ({ ...f, due_date: e.target.value }))}
                        />
                      </div>
                    </div>

                    {editError && <p className="text-sm text-destructive">{editError}</p>}

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={savingEdit || !editForm.title.trim()}
                        onClick={() => saveEdit(task.id)}
                        className="h-11 md:h-8"
                      >
                        <Check className="h-4 w-4" />
                        {savingEdit ? 'Saving…' : 'Save'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={cancelEdit}
                        className="h-11 md:h-8"
                      >
                        <X className="h-4 w-4" />
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            }

            return (
              <Card key={task.id} className="rounded-xl shadow-sm">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground wrap-break-word">{task.title}</p>
                      <Badge className={cn('border-transparent', STATUS_BADGE_CLASS[task.status])}>
                        {STATUS_LABEL[task.status]}
                      </Badge>
                      <Badge className={cn('border-transparent', PRIORITY_BADGE_CLASS[task.priority])}>
                        {PRIORITY_LABEL[task.priority]}
                      </Badge>
                    </div>
                    {(task.assignee || dueDateLabel) && (
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        {task.assignee && (
                          <span className="flex items-center gap-1">
                            <User className="h-3.5 w-3.5" />
                            {task.assignee}
                          </span>
                        )}
                        {dueDateLabel && (
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {dueDateLabel}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 md:size-8"
                      onClick={() => startEdit(task)}
                      aria-label={`Edit ${task.title}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 text-destructive hover:text-destructive md:size-8"
                      onClick={() => handleDelete(task.id, task.title)}
                      aria-label={`Delete ${task.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
