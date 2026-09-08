import { NavLink } from 'react-router-dom';
import { mobileNavigation } from '@/app/routes';
import { cn } from '@/lib/utils';

/** Bottom tab bar. Sits above the safe area on notched phones. */
export function MobileNav() {
  return (
    <nav className="flex shrink-0 items-stretch border-t bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {mobileNavigation.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground',
            )
          }
        >
          <Icon className="size-5" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
