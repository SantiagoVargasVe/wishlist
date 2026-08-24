/** Shared centered-card treatment for /login and /register. A route group — doesn't affect the URL. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex max-w-sm flex-col px-4 py-16">{children}</div>;
}
