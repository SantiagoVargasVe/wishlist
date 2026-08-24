"use client";

import { Toast } from "@base-ui-components/react/toast";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * One `QueryClient` per browser tab, created lazily so it survives Fast
 * Refresh instead of resetting the cache on every edit in dev.
 *
 * Defaults live here, not per-hook, per design-system.md § Data:
 * - `staleTime` 30s — this is a handful of family members editing a
 *   wishlist occasionally, not a live dashboard; no need to refetch on
 *   every focus.
 * - `refetchOnWindowFocus: false` — same reasoning, and it avoids a
 *   surprise refetch when someone flips back to the tab on their phone.
 * - `retry: 1` — tolerate one transient blip without hammering a backend
 *   that might genuinely be down.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <Toast.Provider>{children}</Toast.Provider>
    </QueryClientProvider>
  );
}
