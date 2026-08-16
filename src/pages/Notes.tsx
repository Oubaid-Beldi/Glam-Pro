import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { StickyNote, FolderKanban, Pencil, Trash2, Check, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useProjects } from '@/lib/projects-context'
import { useNotes, type Note, type NoteInput } from '@/lib/use-notes'
import { cn } from '@/lib/utils'

const EMPTY_FORM: NoteInput = { title: '', content: '' }

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Notes() {
  const { activeProject, loading: projectsLoading } = useProjects()
  const { notes, loading, error, createNote, updateNote, deleteNote } = useNotes(
    activeProject?.id ?? null,
  )

  const [form, setForm] = useState<NoteInput>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<NoteInput>(EMPTY_FORM)
  const [editError, setEditError] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSubmitting(true)
    setFormError(null)
    const { error } = await createNote({ ...form, title: form.title.trim() })
    setSubmitting(false)
    if (error) {
      setFormError(error)
      return
    }
    setForm(EMPTY_FORM)
  }

  function startEdit(note: Note) {
    setEditingId(note.id)
    setEditError(null)
    setEditForm({ title: note.title, content: note.content ?? '' })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditError(null)
  }

  async function saveEdit(id: string) {
    if (!editForm.title.trim()) return
    setSavingEdit(true)
    setEditError(null)
    const { error } = await updateNote(id, { ...editForm, title: editForm.title.trim() })
    setSavingEdit(false)
    if (error) {
      setEditError(error)
      return
    }
    setEditingId(null)
  }

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`Delete note "${title}"? This can't be undone.`)) return
    await deleteNote(id)
  }

  if (!projectsLoading && !activeProject) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Notes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Capture ideas and reference material for the selected project.
          </p>
        </div>
        <div className="flex min-h-96 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card p-12 text-center shadow-sm">
          <FolderKanban className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No active project</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Create or select a project first — notes belong to a project.
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
        <h1 className="text-2xl font-semibold text-foreground">Notes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {activeProject ? (
            <>
              Notes for <span className="font-medium text-foreground">{activeProject.name}</span>
            </>
          ) : (
            'Capture ideas and reference material for the selected project.'
          )}
        </p>
      </div>

      <Card className="rounded-xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">New note</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="note-title">Title</Label>
              <Input
                id="note-title"
                className="h-11 md:h-9"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Campaign ideas for Q3"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="note-content">Content</Label>
              <Textarea
                id="note-content"
                className="min-h-28"
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Optional"
              />
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <Button
              type="submit"
              disabled={submitting || !form.title.trim()}
              className="h-11 self-start md:h-8"
            >
              {submitting ? 'Adding…' : 'Add note'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {loading ? 'Loading notes…' : `${notes.length} note${notes.length === 1 ? '' : 's'}`}
        </h2>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {!loading && notes.length === 0 && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card p-12 text-center shadow-sm">
            <StickyNote className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No notes yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Add your first note above to start capturing ideas for this project.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {notes.map((note) => {
            const isEditing = editingId === note.id

            if (isEditing) {
              return (
                <Card key={note.id} className="rounded-xl shadow-sm ring-1 ring-ring">
                  <CardContent className="flex flex-col gap-4 p-4">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`edit-title-${note.id}`}>Title</Label>
                      <Input
                        id={`edit-title-${note.id}`}
                        className="h-11 md:h-9"
                        value={editForm.title}
                        onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`edit-content-${note.id}`}>Content</Label>
                      <Textarea
                        id={`edit-content-${note.id}`}
                        className="min-h-28"
                        value={editForm.content}
                        onChange={(e) => setEditForm((f) => ({ ...f, content: e.target.value }))}
                      />
                    </div>

                    {editError && <p className="text-sm text-destructive">{editError}</p>}

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={savingEdit || !editForm.title.trim()}
                        onClick={() => saveEdit(note.id)}
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
              <Card key={note.id} className="rounded-xl shadow-sm">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground wrap-break-word">{note.title}</p>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(note.created_at)}
                      </span>
                    </div>
                    {note.content && (
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground wrap-break-word">
                        {note.content}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 md:size-8"
                      onClick={() => startEdit(note)}
                      aria-label={`Edit ${note.title}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 text-destructive hover:text-destructive md:size-8"
                      onClick={() => handleDelete(note.id, note.title)}
                      aria-label={`Delete ${note.title}`}
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
