import { isIP } from "node:net";

/**
 * The denylist from security.md, verbatim. Anything in one of these ranges
 * is a private/internal/reserved address this self-hosted app must never let
 * a pasted URL reach — the router admin page, another container, cloud
 * metadata, etc.
 */
const DENIED_IPV4_RANGES: [network: string, prefixLength: number][] = [
  ["127.0.0.0", 8], // loopback
  ["10.0.0.0", 8], // private
  ["169.254.0.0", 16], // link-local
  ["172.16.0.0", 12], // private
  ["100.64.0.0", 10], // CGNAT
  ["192.168.0.0", 16], // private
  ["0.0.0.0", 8], // this-network
  ["224.0.0.0", 4], // multicast
];

const DENIED_IPV6_RANGES: [network: string, prefixLength: number][] = [
  ["::1", 128], // loopback
  ["fe80::", 10], // link-local
  ["fc00::", 7], // unique local ("private" for v6)
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0);
}

/**
 * `prefixLength === 0` needs its own branch: JS's `<<` uses the shift amount
 * mod 32, so `0xffffffff << 32` is `0xffffffff << 0` — i.e. *unshifted*, not
 * zeroed. Without the guard, a `/0` range (match-everything) would silently
 * compute a match-nothing-but-the-exact-host mask instead.
 */
export function isInIpv4Range(ip: string, network: string, prefixLength: number): boolean {
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(network) & mask);
}

/**
 * Expands any valid textual IPv6 form — full, `::`-compressed, or with a
 * trailing dotted-quad (`::ffff:192.168.1.1`) — into its 128-bit value.
 *
 * No group-count guard: `net.isIP` already guarantees a "6" classification
 * expands to exactly 8 groups, and `isDeniedAddress` never calls this on
 * anything `net.isIP` hasn't already validated — trust that guarantee
 * rather than re-checking it.
 */
function parseIpv6(ip: string): bigint {
  let address = ip.split("%")[0]; // strip a zone id (fe80::1%eth0) defensively

  const v4Tail = address.match(/^(.*:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (v4Tail) {
    const v4Int = ipv4ToInt(v4Tail[2]);
    const hi = ((v4Int >>> 16) & 0xffff).toString(16);
    const lo = (v4Int & 0xffff).toString(16);
    address = `${v4Tail[1]}${hi}:${lo}`;
  }

  const [head, tail] = address.split("::");
  const headParts = head ? head.split(":").filter(Boolean) : [];
  const tailParts = tail !== undefined ? tail.split(":").filter(Boolean) : [];

  let groups: string[];
  if (address.includes("::")) {
    const missing = 8 - headParts.length - tailParts.length;
    groups = [...headParts, ...Array(Math.max(missing, 0)).fill("0"), ...tailParts];
  } else {
    groups = address.split(":");
  }

  return groups.reduce((acc, group) => (acc << 16n) | BigInt(parseInt(group || "0", 16)), 0n);
}

/**
 * No `/0` special case needed here unlike {@link isInIpv4Range}: BigInt
 * shifts don't wrap the way 32-bit `<<` does, so `~0n << 128n` masked back
 * to 128 bits is genuinely `0n` — verified, not assumed.
 */
export function isInIpv6Range(ip: string, network: string, prefixLength: number): boolean {
  const shift = 128n - BigInt(prefixLength);
  const mask = (~0n << shift) & ((1n << 128n) - 1n);
  return (parseIpv6(ip) & mask) === (parseIpv6(network) & mask);
}

/** The embedded IPv4 of a `::ffff:0:0/96` address, or null if it isn't one. */
function embeddedIpv4(ip: string): string | null {
  const value = parseIpv6(ip);
  if (value >> 32n !== 0xffffn) return null;
  const v4Int = Number(value & 0xffffffffn);
  return [24, 16, 8, 0].map((shift) => (v4Int >>> shift) & 0xff).join(".");
}

/**
 * The one function `safeFetch` calls before connecting to anything — every
 * resolved address, every hop of every redirect. A v4-mapped v6 address
 * (`::ffff:127.0.0.1`) is checked via its embedded v4 rather than the whole
 * `::ffff:0:0/96` block, which also contains ordinary public v4 addresses.
 */
export function isDeniedAddress(address: string): boolean {
  const family = isIP(address);

  if (family === 4) {
    return DENIED_IPV4_RANGES.some(([network, len]) => isInIpv4Range(address, network, len));
  }

  if (family === 6) {
    const v4 = embeddedIpv4(address);
    if (v4) return DENIED_IPV4_RANGES.some(([network, len]) => isInIpv4Range(v4, network, len));
    return DENIED_IPV6_RANGES.some(([network, len]) => isInIpv6Range(address, network, len));
  }

  // Not a literal IP at all — safe-fetch only ever calls this with resolved
  // addresses, so anything else is treated as unsafe rather than silently ignored.
  return true;
}
