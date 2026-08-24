// Placeholder. Replaced by the real routes in T014 (auth) and T051 (list view).
// Exists to visually verify tokens, fonts, and primitives render correctly
// in both themes — Dialog/Field/Select/Checkbox are covered by component
// tests instead of cluttering this soon-to-be-deleted page further.

import { Button } from "./_ui/button";

const TOKENS = [
  ["bg-background text-foreground border border-border", "background"],
  ["bg-card text-card-foreground shadow-sm", "card"],
  ["bg-primary text-primary-foreground", "primary"],
  ["bg-secondary text-secondary-foreground", "secondary"],
  ["bg-muted text-muted-foreground", "muted"],
  ["bg-accent text-accent-foreground", "accent"],
  ["bg-destructive text-destructive-foreground", "destructive"],
] as const;

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <p className="text-muted-foreground">
        Scaffold listo. La aplicación se construye en el backlog.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="primary" disabled>
          Disabled
        </Button>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TOKENS.map(([className, label]) => (
          <div key={label} className={`rounded-lg p-4 text-sm ${className}`}>
            {label}
          </div>
        ))}
      </div>
    </main>
  );
}
