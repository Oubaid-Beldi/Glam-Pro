import type { PostStatus } from '@/lib/use-posts'

export const STATUS_LABEL: Record<PostStatus, string> = {
  draft: 'Pending',
  scheduled: 'Scheduled',
  published: 'Published',
  failed: 'Failed',
}

export const STATUS_BADGE_CLASS: Record<PostStatus, string> = {
  draft: 'bg-warning/10 text-warning',
  scheduled: 'bg-info/10 text-info',
  published: 'bg-success/10 text-success',
  failed: 'bg-destructive/10 text-destructive',
}

export function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// datetime-local inputs need "YYYY-MM-DDTHH:mm" in the *local* timezone, not toISOString() (which is UTC)
export function toDateTimeLocalValue(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function nowDateTimeLocalValue() {
  return toDateTimeLocalValue(new Date().toISOString())
}
