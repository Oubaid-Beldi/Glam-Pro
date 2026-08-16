import { ListChecks } from 'lucide-react'
import { PlaceholderPage } from '@/components/PlaceholderPage'

export default function Tasks() {
  return (
    <PlaceholderPage
      title="Tasks"
      icon={ListChecks}
      description="Track work by status and priority within the selected project."
    />
  )
}
