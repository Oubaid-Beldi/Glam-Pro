import { useState, type FormEvent } from 'react'
import { FolderKanban, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useProjects } from '@/lib/projects-context'
import { cn } from '@/lib/utils'

export default function Projects() {
  const { projects, loading, error, activeProject, setActiveProjectId, createProject } =
    useProjects()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    setFormError(null)
    const { error } = await createProject(name.trim(), description.trim())
    setSubmitting(false)
    if (error) {
      setFormError(error)
      return
    }
    setName('')
    setDescription('')
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Projects</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create and manage the projects your tasks, notes, and posts live under.
        </p>
      </div>

      <Card className="rounded-xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">New project</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                className="h-11 md:h-9"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Spring Launch"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-description">Description</Label>
              <Input
                id="project-description"
                className="h-11 md:h-9"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
              />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <Button
              type="submit"
              disabled={submitting || !name.trim()}
              className="h-11 self-start md:h-8"
            >
              {submitting ? 'Creating…' : 'Create project'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Your projects</h2>

        {loading && <p className="text-sm text-muted-foreground">Loading projects…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!loading && projects.length === 0 && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card p-12 text-center shadow-sm">
            <FolderKanban className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No projects yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Create your first project above to get started.
            </p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const isActive = project.id === activeProject?.id
            return (
              <Card
                key={project.id}
                className={cn(
                  'rounded-xl shadow-sm transition-colors',
                  isActive && 'ring-2 ring-primary',
                )}
              >
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                  <CardTitle className="text-base wrap-break-word">{project.name}</CardTitle>
                  {isActive && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      <Check className="h-3 w-3" />
                      Active
                    </span>
                  )}
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="min-h-5 text-sm text-muted-foreground">
                    {project.description || 'No description'}
                  </p>
                  <Button
                    type="button"
                    variant={isActive ? 'secondary' : 'outline'}
                    size="sm"
                    disabled={isActive}
                    onClick={() => setActiveProjectId(project.id)}
                    className="min-h-11 self-start md:min-h-0"
                  >
                    {isActive ? 'Active project' : 'Set as active'}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
