import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Megaphone, FolderKanban, Sparkles, Check } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/lib/auth-context'
import { useProjects } from '@/lib/projects-context'
import { usePosts, type PostStatus } from '@/lib/use-posts'
import { cn } from '@/lib/utils'

const STATUS_LABEL: Record<PostStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  published: 'Published',
  failed: 'Failed',
}

const STATUS_BADGE_CLASS: Record<PostStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  scheduled: 'bg-info/10 text-info',
  published: 'bg-success/10 text-success',
  failed: 'bg-destructive/10 text-destructive',
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Marketing() {
  const { session } = useAuth()
  const { activeProject, loading: projectsLoading } = useProjects()
  const { posts, loading: postsLoading, error: postsError, createPost } = usePosts(
    activeProject?.id ?? null,
  )

  const [objective, setObjective] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const [drafts, setDrafts] = useState<string[] | null>(null)
  const [draftEdits, setDraftEdits] = useState<string[]>([])
  const [savedGeneration, setSavedGeneration] = useState<string[] | null>(null)
  const [savingIndex, setSavingIndex] = useState<number | null>(null)
  const [savedIndices, setSavedIndices] = useState<Set<number>>(new Set())
  const [validateError, setValidateError] = useState<{ index: number; message: string } | null>(
    null,
  )

  async function handleGenerate(e: FormEvent) {
    e.preventDefault()
    if (!objective.trim() || !activeProject || !session) return
    setGenerating(true)
    setGenerateError(null)
    setDrafts(null)
    setSavedIndices(new Set())
    setValidateError(null)

    try {
      const res = await fetch('/api/generate-posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ projectId: activeProject.id, objective: objective.trim() }),
      })
      const body = await res.json()
      if (!res.ok) {
        setGenerateError(body?.error || 'Failed to generate drafts. Please try again.')
        return
      }
      setDrafts(body.drafts)
      setDraftEdits(body.drafts)
      setSavedGeneration(body.drafts)
    } catch {
      setGenerateError('Could not reach the server. Check your connection and try again.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleValidate(index: number) {
    if (!draftEdits[index]?.trim() || !savedGeneration) return
    setSavingIndex(index)
    setValidateError(null)
    const { error } = await createPost({
      objective: objective.trim(),
      ai_variants: savedGeneration,
      content: draftEdits[index].trim(),
    })
    setSavingIndex(null)
    if (error) {
      setValidateError({ index, message: error })
      return
    }
    setSavedIndices((prev) => new Set(prev).add(index))
  }

  if (!projectsLoading && !activeProject) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Marketing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate, edit, and save AI-assisted LinkedIn post drafts.
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
        <h1 className="text-2xl font-semibold text-foreground">Marketing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {activeProject ? (
            <>
              LinkedIn drafts for{' '}
              <span className="font-medium text-foreground">{activeProject.name}</span>
            </>
          ) : (
            'Generate, edit, and save AI-assisted LinkedIn post drafts.'
          )}
        </p>
      </div>

      <Card className="rounded-xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Generate drafts</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGenerate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="objective">Objective</Label>
              <Textarea
                id="objective"
                className="min-h-20"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="e.g. Announce our new product feature and drive signups"
                required
              />
            </div>

            {generateError && <p className="text-sm text-destructive">{generateError}</p>}

            <Button
              type="submit"
              disabled={generating || !objective.trim()}
              className="h-11 self-start md:h-8"
            >
              <Sparkles className="h-4 w-4" />
              {generating ? 'Generating…' : 'Generate'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {drafts && drafts.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {drafts.length} draft{drafts.length === 1 ? '' : 's'} — edit, then validate to save
          </h2>

          <div className="flex flex-col gap-3">
            {drafts.map((_, index) => {
              const isSaved = savedIndices.has(index)
              return (
                <Card key={index} className="rounded-xl shadow-sm">
                  <CardContent className="flex flex-col gap-3 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">
                        Draft {index + 1}
                      </span>
                      {isSaved && (
                        <Badge className="border-transparent bg-success/10 text-success">
                          <Check className="h-3 w-3" />
                          Saved
                        </Badge>
                      )}
                    </div>
                    <Textarea
                      className="min-h-32"
                      value={draftEdits[index]}
                      onChange={(e) =>
                        setDraftEdits((prev) =>
                          prev.map((d, i) => (i === index ? e.target.value : d)),
                        )
                      }
                      disabled={isSaved}
                    />
                    {validateError?.index === index && (
                      <p className="text-sm text-destructive">{validateError.message}</p>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      disabled={isSaved || savingIndex === index || !draftEdits[index]?.trim()}
                      onClick={() => handleValidate(index)}
                      className="h-11 self-start md:h-8"
                    >
                      {isSaved ? 'Saved as draft' : savingIndex === index ? 'Saving…' : 'Validate'}
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {postsLoading
            ? 'Loading saved posts…'
            : `${posts.length} saved post${posts.length === 1 ? '' : 's'}`}
        </h2>

        {postsError && <p className="text-sm text-destructive">{postsError}</p>}

        {!postsLoading && posts.length === 0 && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card p-12 text-center shadow-sm">
            <Megaphone className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No saved posts yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Generate drafts above and validate one to save it here.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {posts.map((post) => (
            <Card key={post.id} className="rounded-xl shadow-sm">
              <CardContent className="flex flex-col gap-1.5 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground wrap-break-word">{post.objective}</p>
                  <Badge className={cn('border-transparent', STATUS_BADGE_CLASS[post.status])}>
                    {STATUS_LABEL[post.status]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(post.created_at)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground wrap-break-word">
                  {post.content}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
