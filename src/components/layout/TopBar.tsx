import { ChevronsUpDown, Menu } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

export function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-2 border-b border-border bg-card px-3 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-foreground hover:bg-muted md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'h-11 min-w-0 justify-between gap-2 rounded-lg px-3 text-sm font-medium md:h-9',
            )}
          >
            <span className="truncate">No project selected</span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem disabled>No projects yet</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger className="flex size-11 shrink-0 items-center justify-center rounded-full outline-none ring-ring focus-visible:ring-2">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary text-primary-foreground">
              ?
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem disabled>Not signed in</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
