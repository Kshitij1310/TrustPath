import { NavLink } from 'react-router-dom';
import { Route } from 'lucide-react';
import { navigation } from '@/app/routes';
import { useIsAdmin } from '@/stores/authStore';
import { cn } from '@/lib/utils';

export function SidebarNav({ onNavigate, className }) {
  const isAdmin = useIsAdmin();
  const items = navigation.filter((item) => !item.adminOnly || isAdmin);

  return (
    <nav className={cn('flex flex-col gap-1', className)}>
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )
          }
        >
          <Icon className="size-4 shrink-0" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Desktop sidebar. On mobile the same nav renders inside a Sheet. */
export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-card/50 md:flex">
      <div className="flex h-16 items-center gap-2 border-b px-5">
        <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Route className="size-4" />
        </span>
        <span className="font-semibold tracking-tight">TrustRoute</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <SidebarNav />
      </div>

      <p className="border-t p-4 text-[11px] leading-relaxed text-muted-foreground">
        Risk scores are contextual estimates, not predictions of crime.
      </p>
    </aside>
  );
}
