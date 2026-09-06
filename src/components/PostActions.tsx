import { useState } from 'react'
import { Check, Copy, ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Post } from '@/lib/use-posts'

export function PostActions({
  post,
  onMarkPublished,
}: {
  post: Post
  onMarkPublished: (id: string) => Promise<{ error: string | null }>
}) {
  const [copied, setCopied] = useState(false)
  const [marking, setMarking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(post.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy to clipboard.')
    }
  }

  async function handleMarkPublished() {
    setMarking(true)
    setError(null)
    const { error } = await onMarkPublished(post.id)
    setMarking(false)
    if (error) setError(error)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleCopy}
        className="h-11 md:h-8"
      >
        {copied ? <ClipboardCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Copied' : 'Copy content'}
      </Button>
      {(post.status === 'scheduled' || post.status === 'failed') && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={marking}
          onClick={handleMarkPublished}
          className="h-11 md:h-8"
        >
          <Check className="h-4 w-4" />
          {marking ? 'Marking…' : 'Mark as published'}
        </Button>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
