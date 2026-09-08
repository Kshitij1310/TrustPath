import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LogOut, Menu, Monitor, Moon, Route, Sun, User, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { useCurrentUser } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useLogout } from '@/features/auth/queries';
import { paths } from '@/app/routes';
import { SidebarNav } from './Sidebar';

const THEMES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function Topbar() {
  const user = useCurrentUser();
  const logout = useLogout();
  const isOnline = useOnlineStatus();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const initials =
    user?.displayName
      ?.split(' ')
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() ?? '?';

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-card/50 px-4 backdrop-blur md:px-6">
      {/* Mobile: the sidebar nav lives in a sheet. */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="flex h-16 items-center gap-2 border-b px-5">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Route className="size-4" />
            </span>
            TrustRoute
          </SheetTitle>
          <div className="p-3">
            <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <Link to={paths.plan} className="flex items-center gap-2 font-semibold md:hidden">
        TrustRoute
      </Link>

      <div className="flex-1" />

      {!isOnline && (
        <Badge variant="destructive" className="gap-1.5">
          <WifiOff className="size-3" />
          Offline
        </Badge>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Account menu">
            <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {initials}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <p className="text-sm font-medium">{user?.displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link to={paths.settings}>
              <User />
              Settings & privacy
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Theme
          </DropdownMenuLabel>
          {THEMES.map(({ value, label, icon: Icon }) => (
            <DropdownMenuItem
              key={value}
              onSelect={() => setTheme(value)}
              className={theme === value ? 'bg-accent' : undefined}
            >
              <Icon />
              {label}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={logout} className="text-destructive focus:text-destructive">
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
