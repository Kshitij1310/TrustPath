import { Link } from 'react-router-dom';
import { Route, ShieldCheck } from 'lucide-react';

const PILLARS = [
  { title: 'Safer, not just faster', body: 'Routes are scored on context, then ranked — the fastest road is not always the one to take.' },
  { title: 'Explained, not asserted', body: 'Every score comes with the reasons behind it: recent incidents, reports, time of day.' },
  { title: 'Watched end to end', body: 'Journey Guardian notices deviations and overdue arrivals, and prepares an SOS you control.' },
];

/** Split layout shared by login and register. */
export function AuthLayout({ title, description, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel — hidden on phones, where the form is all that matters. */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary/5 p-12 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, hsl(var(--primary)) 0, transparent 45%), radial-gradient(circle at 80% 70%, hsl(var(--risk-low)) 0, transparent 40%)',
          }}
          aria-hidden
        />
        <Link to="/" className="relative flex items-center gap-2 text-lg font-semibold">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Route className="size-5" />
          </span>
          TrustRoute
        </Link>

        <div className="relative space-y-8">
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">
            A privacy-first safety layer for the journeys you already make.
          </h2>
          <ul className="space-y-5">
            {PILLARS.map((pillar) => (
              <li key={pillar.title} className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <p className="font-medium">{pillar.title}</p>
                  <p className="text-sm text-muted-foreground">{pillar.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative max-w-md text-xs text-muted-foreground">
          Risk scores are contextual estimates built from historical data, recent incidents and
          community reports. They are not predictions of crime.
        </p>
      </aside>

      <main className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-6">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold lg:hidden">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Route className="size-5" />
            </span>
            TrustRoute
          </Link>

          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>

          {children}

          {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
