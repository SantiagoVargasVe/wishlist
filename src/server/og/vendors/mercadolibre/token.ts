import "server-only";

const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

// Refresh a little before the real expiry so a request in flight never races
// a token that just lapsed.
const EXPIRY_BUFFER_MS = 60_000;

type TokenResponse = { access_token: string; expires_in: number };

export type MeliTokenProvider = (
  clientId: string,
  clientSecret: string,
) => Promise<string>;

/**
 * App-level `client_credentials` access token — no user login, no seller
 * consent screen. Confirmed live (T036) this grant reaches `GET
 * /products/:id` and `GET /products/:id/items`; it does **not** reach `GET
 * /items/:id` (`403 access_denied`, even for a real, live item) — that needs
 * the item's own seller to grant an Authorization Code consent, out of
 * scope here.
 *
 * `createMeliTokenProvider` returns a closure holding its own cache rather
 * than a module-level singleton, so tests get an isolated instance instead
 * of needing to reset shared state between cases. The app uses one shared
 * instance (below) so the token — reusable for its full ~6h lifetime,
 * confirmed via a live `expires_in` — is actually cached across requests
 * rather than fetched per preview.
 */
export function createMeliTokenProvider(
  fetchImpl: typeof fetch = fetch,
): MeliTokenProvider {
  let cached: { accessToken: string; expiresAt: number } | null = null;

  return async (clientId, clientSecret) => {
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.accessToken;

    const response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`MercadoLibre token exchange failed: ${response.status}`);
    }

    const data = (await response.json()) as TokenResponse;
    cached = {
      accessToken: data.access_token,
      expiresAt: now + data.expires_in * 1000 - EXPIRY_BUFFER_MS,
    };
    return cached.accessToken;
  };
}

export const getMeliAccessToken = createMeliTokenProvider();
