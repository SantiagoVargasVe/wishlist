import "server-only";

import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";

import { isDeniedAddress } from "./ip-rules";

const MAX_REDIRECTS = 3;

// Callers pass their own timeout/user-agent (T031/T032 will pass
// config.OG_FETCH_TIMEOUT_MS / config.OG_USER_AGENT). This module stays
// config-agnostic on purpose — it's the primitive, not a consumer — so its
// tests don't need the app's full environment schema satisfied just to
// exercise a fetch guard. These match config.schema.ts's own defaults.
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_USER_AGENT = "WishlistBot/1.0";

/** Never surfaced to a client — real detail goes to `console.error` instead (security.md). */
export class SafeFetchError extends Error {
  constructor(reason: string) {
    super("Unable to fetch the requested URL");
    this.name = "SafeFetchError";
    console.error(`safeFetch blocked or failed: ${reason}`);
  }
}

type ResolvedAddress = { address: string; family: 4 | 6 };

type Transport = (params: {
  url: URL;
  connectAddress: string;
  family: 4 | 6;
  timeoutMs: number;
  userAgent: string;
}) => Promise<{
  statusCode: number;
  headers: Record<string, string | undefined>;
  body: AsyncIterable<Buffer>;
}>;

export type SafeFetchDeps = {
  resolveHost?: (hostname: string) => Promise<ResolvedAddress[]>;
  transport?: Transport;
};

export type SafeFetchOptions = {
  /** e.g. `["text/html"]` or `["image/"]` — matched by prefix. */
  allowedContentTypePrefixes: string[];
  maxBytes: number;
  timeoutMs?: number;
  userAgent?: string;
};

export type SafeFetchResult = {
  body: Buffer;
  contentType: string;
  finalUrl: string;
};

export async function defaultResolveHost(hostname: string): Promise<ResolvedAddress[]> {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.map((r) => ({ address: r.address, family: r.family as 4 | 6 }));
}

/**
 * Node calls `lookup` exactly once per connection and uses whatever it
 * returns — no second resolution happens later, which is what makes this
 * the actual fix for DNS-rebinding TOCTOU rather than a check that a later
 * step can quietly bypass. `hostname`/`headers`/TLS SNI still come from the
 * original URL, since only the connection target is overridden.
 *
 * Two return shapes, not one: Node 20+ enables `autoSelectFamily` (Happy
 * Eyeballs) by default, and when it's racing connections it calls `lookup`
 * with `{ all: true }` expecting `callback(err, [{ address, family }])` —
 * the single-address `callback(err, address, family)` form only fires when
 * `all` isn't set. Confirmed empirically (a real fetch to a public host
 * threw `ERR_INVALID_IP_ADDRESS: Invalid IP address: undefined` against the
 * single-shape-only version); every unit test here stubs `transport`
 * entirely, so this branch was invisible until a real request exercised it.
 */
export function pinnedLookup(
  address: string,
  family: 4 | 6,
): (
  hostname: string,
  options: { all?: boolean },
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | { address: string; family: number }[],
    family?: number,
  ) => void,
) => void {
  return (_hostname, options, callback) => {
    if (options?.all) {
      callback(null, [{ address, family }]);
    } else {
      callback(null, address, family);
    }
  };
}

export const defaultTransport: Transport = ({ url, connectAddress, family, timeoutMs, userAgent }) => {
  const client = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(
      url,
      {
        lookup: pinnedLookup(connectAddress, family),
        timeout: timeoutMs,
        headers: { "User-Agent": userAgent },
      },
      (res) => {
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers as Record<string, string | undefined>,
          body: res,
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("request timed out")));
    req.on("error", reject);
    req.end();
  });
};

async function readWithLimit(body: AsyncIterable<Buffer>, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of body) {
    total += chunk.length;
    if (total > maxBytes) {
      const destroyable = body as { destroy?: () => void };
      destroyable.destroy?.();
      throw new Error("response exceeded the size limit");
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function resolveAndValidate(
  hostname: string,
  resolveHost: (hostname: string) => Promise<ResolvedAddress[]>,
): Promise<ResolvedAddress> {
  const addresses = await resolveHost(hostname);
  if (addresses.length === 0) throw new Error(`could not resolve ${hostname}`);
  if (addresses.some((a) => isDeniedAddress(a.address))) {
    throw new Error(`${hostname} resolved to a denied address`);
  }
  return addresses[0];
}

/**
 * The only place in the codebase allowed to make an outbound HTTP request
 * for a user-supplied URL. See security.md — this fetches on behalf of a
 * self-hosted app sitting on a LAN with private admin interfaces, so every
 * hop of every request is resolved, validated, and connection-pinned before
 * a single byte moves.
 */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions,
  deps: SafeFetchDeps = {},
): Promise<SafeFetchResult> {
  const resolveHost = deps.resolveHost ?? defaultResolveHost;
  const transport = deps.transport ?? defaultTransport;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;

  return withTimeout(
    (async () => {
      let currentUrl: URL;
      try {
        currentUrl = new URL(rawUrl);
      } catch {
        throw new SafeFetchError(`malformed URL: ${rawUrl}`);
      }

      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        if (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") {
          throw new SafeFetchError(`rejected scheme: ${currentUrl.protocol}`);
        }

        const { address, family } = await resolveAndValidate(currentUrl.hostname, resolveHost).catch(
          (error: unknown) => {
            throw new SafeFetchError(String(error));
          },
        );

        const response = await transport({
          url: currentUrl,
          connectAddress: address,
          family,
          timeoutMs,
          userAgent,
        }).catch((error: unknown) => {
          throw new SafeFetchError(String(error));
        });

        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          if (hop === MAX_REDIRECTS) throw new SafeFetchError("too many redirects");
          currentUrl = new URL(response.headers.location, currentUrl);
          continue;
        }

        const contentType = response.headers["content-type"] ?? "";
        if (!options.allowedContentTypePrefixes.some((p) => contentType.startsWith(p))) {
          throw new SafeFetchError(`disallowed content type: ${contentType}`);
        }

        const body = await readWithLimit(response.body, options.maxBytes).catch(
          (error: unknown) => {
            throw new SafeFetchError(String(error));
          },
        );

        return { body, contentType, finalUrl: currentUrl.toString() };
      }

      throw new SafeFetchError("too many redirects");
    })(),
    timeoutMs,
  ).catch((error: unknown) => {
    if (error instanceof SafeFetchError) throw error;
    throw new SafeFetchError(String(error));
  });
}
