import "server-only";

/**
 * The client's IP, for rate-limit bucketing.
 *
 * `CF-Connecting-IP` is set by Cloudflare and strips any client-supplied value,
 * so it is trustworthy **as long as the app is only reachable through the
 * tunnel** — which it is: the production stack publishes no ports and there is
 * no router port-forward.
 *
 * That assumption is the whole basis for trusting this header. If the app is
 * ever exposed directly, a client could forge it and bucket themselves as
 * anyone they like, making rate limiting useless.
 *
 * `X-Forwarded-For` is deliberately NOT consulted: it is client-settable and
 * trusting it would hand out a trivial bypass.
 *
 * Requests with no recognised header share a single bucket. That's the
 * conservative direction — over-limiting an unusual case beats handing out an
 * unlimited one, and in practice it only happens in local development.
 */
export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")?.trim() || "unknown";
}
