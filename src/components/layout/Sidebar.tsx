import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderKanban,
  ListChecks,
  StickyNote,
  Megaphone,
  Calendar,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS: {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/notes', label: 'Notes', icon: StickyNote },
  { to: '/marketing', label: 'Marketing', icon: Megaphone },
  { to: '/calendar', label: 'Calendar', icon: Calendar },
]

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <>
      {/* Mobile backdrop — sits below the drawer, above everything else */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-30 bg-foreground/40 transition-opacity md:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-sidebar text-sidebar-foreground transition-transform duration-200 ease-out md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between gap-2 px-4 md:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
              G
            </div>
            <span className="text-lg font-semibold">GLAM PRO</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex size-11 items-center justify-center rounded-lg text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  )
}
