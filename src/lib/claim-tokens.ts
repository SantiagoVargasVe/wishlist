const STORAGE_KEY = "wishlist:claims";

type ClaimTokens = Record<string, string>;

/**
 * Only ever called from a client component's effect/event handler, never
 * during render — same rule `theme-toggle.tsx` follows for its own
 * localStorage read, since SSR has no `localStorage` to read from.
 */
function readAll(): ClaimTokens {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ClaimTokens) : {};
  } catch {
    return {};
  }
}

/** What lets an anonymous claimer undo their own claim without an account. */
export function getClaimToken(itemId: string): string | null {
  return readAll()[itemId] ?? null;
}

export function setClaimToken(itemId: string, token: string): void {
  const tokens = readAll();
  tokens[itemId] = token;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export function removeClaimToken(itemId: string): void {
  const tokens = readAll();
  delete tokens[itemId];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}
