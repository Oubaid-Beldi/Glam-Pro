import { Calendar as CalendarIcon } from 'lucide-react'
import { PlaceholderPage } from '@/components/PlaceholderPage'

export default function Calendar() {
  return (
    <PlaceholderPage
      title="Calendar"
      icon={CalendarIcon}
      description="See scheduled, published, pending, and failed posts by date."
    />
  )
}
