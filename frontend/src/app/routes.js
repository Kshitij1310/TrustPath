import {
  LayoutDashboard,
  MapPin,
  MessageSquareWarning,
  Navigation,
  Settings,
  ShieldAlert,
  Siren,
} from 'lucide-react';

/** Canonical paths — never hard-code a route string in a component. */
export const paths = {
  login: '/login',
  register: '/register',
  plan: '/',
  journey: '/journey',
  reports: '/reports',
  alerts: '/alerts',
  emergency: '/emergency',
  settings: '/settings',
  admin: '/admin',
  sharedJourney: (token = ':token') => `/shared/${token}`,
};

/**
 * Sidebar/mobile-nav entries. `adminOnly` items are filtered out for everyone
 * else — the server enforces the same rule, this only hides the door.
 */
export const navigation = [
  { to: paths.plan, label: 'Safe Route', icon: Navigation, end: true },
  { to: paths.journey, label: 'Journey', icon: MapPin },
  { to: paths.reports, label: 'Reports', icon: MessageSquareWarning },
  { to: paths.alerts, label: 'Alerts', icon: ShieldAlert },
  { to: paths.emergency, label: 'Emergency', icon: Siren },
  { to: paths.settings, label: 'Settings', icon: Settings },
  { to: paths.admin, label: 'Admin', icon: LayoutDashboard, adminOnly: true },
];

/** The four that fit a phone's bottom bar. */
export const mobileNavigation = navigation.filter((item) =>
  [paths.plan, paths.journey, paths.reports, paths.emergency].includes(item.to),
);
