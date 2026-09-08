import { NavLink } from 'react-router-dom';
import { navigation } from '@/app/routes';
import { useIsAdmin } from '@/stores/authStore';
import { cn } from '@/lib/utils';

export function SidebarNav({ onNavigate, className, orientation = 'vertical', exclude = [] }) {
  const isAdmin = useIsAdmin();
  const items = navigation.filter(
    (item) => (!item.adminOnly || isAdmin) && !exclude.includes(item.to),
  );

  return (
    <nav
      className={cn(
        'flex gap-0.5',
        orientation === 'vertical' ? 'flex-col' : 'flex-row items-center',
        className,
      )}
    >
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'group flex items-center gap-2 rounded-lg text-sm font-medium transition-colors',
              orientation === 'vertical' ? 'px-3 py-2' : 'px-3 py-1.5',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                className={cn(
                  'size-4 shrink-0 transition-transform',
                  !isActive && 'group-hover:scale-110',
                )}
              />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
