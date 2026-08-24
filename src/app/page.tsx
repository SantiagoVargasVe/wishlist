// Placeholder. Replaced by the real routes in T014 (auth) and T051 (list view).
// Kept minimal on purpose — it exists to prove the theme and fonts are wired.

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
      <h1 className="text-2xl font-semibold">Wishlist</h1>
      <p className="mt-2 text-muted-foreground">
        Scaffold listo. La aplicación se construye en el backlog.
      </p>

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
