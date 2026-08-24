import { describe, expect, it } from "vitest";
import { isDeniedAddress, isInIpv4Range, isInIpv6Range } from "./ip-rules";

describe("isDeniedAddress — IPv4", () => {
  it.each([
    ["127.0.0.1", "loopback"],
    ["127.255.255.255", "loopback, top of the /8"],
    ["10.0.0.1", "private 10/8"],
    ["10.255.255.255", "private 10/8, top of range"],
    ["169.254.1.1", "link-local"],
    ["172.16.0.1", "private 172.16/12, bottom of range"],
    ["172.31.255.255", "private 172.16/12, top of range"],
    ["100.64.0.1", "CGNAT, bottom of range"],
    ["100.127.255.255", "CGNAT, top of range"],
    ["192.168.1.1", "private 192.168/16"],
    ["0.0.0.0", "this-network"],
    ["0.255.255.255", "this-network, top of the /8"],
    ["224.0.0.1", "multicast"],
    ["239.255.255.255", "multicast, top of the /4"],
  ])("denies %s (%s)", (ip) => {
    expect(isDeniedAddress(ip)).toBe(true);
  });

  it.each([
    ["8.8.8.8", "public DNS"],
    ["1.1.1.1", "public DNS"],
    ["93.184.216.34", "a public web server"],
    ["172.15.255.255", "just below the 172.16/12 private range"],
    ["172.32.0.1", "just above the 172.16/12 private range"],
    ["100.63.255.255", "just below the CGNAT range"],
    ["100.128.0.1", "just above the CGNAT range"],
  ])("allows %s (%s)", (ip) => {
    expect(isDeniedAddress(ip)).toBe(false);
  });
});

describe("isDeniedAddress — IPv6", () => {
  it.each([
    ["::1", "loopback"],
    ["fe80::1", "link-local"],
    ["fe80::abcd:1234", "link-local, another host"],
    ["fc00::1", "unique local, bottom of fc00::/7"],
    ["fd00::1", "unique local, within fc00::/7"],
    ["fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "unique local, top of fc00::/7"],
  ])("denies %s (%s)", (ip) => {
    expect(isDeniedAddress(ip)).toBe(true);
  });

  it.each([
    ["2001:4860:4860::8888", "Google public DNS"],
    ["2606:4700:4700::1111", "Cloudflare public DNS"],
    ["fb00::1", "just below fc00::/7"],
    ["fe00::1", "just above fe80::/10 territory but not link-local"],
  ])("allows %s (%s)", (ip) => {
    expect(isDeniedAddress(ip)).toBe(false);
  });
});

describe("isDeniedAddress — v4-mapped v6", () => {
  it("denies a v4-mapped loopback address", () => {
    expect(isDeniedAddress("::ffff:127.0.0.1")).toBe(true);
  });

  it("denies a v4-mapped private address", () => {
    expect(isDeniedAddress("::ffff:192.168.1.1")).toBe(true);
  });

  it("denies a v4-mapped address in its all-hex form", () => {
    // ::ffff:7f00:1 is ::ffff:127.0.0.1 written without the dotted-quad tail.
    expect(isDeniedAddress("::ffff:7f00:1")).toBe(true);
  });

  it("allows a v4-mapped public address — the /96 block isn't blanket-denied", () => {
    expect(isDeniedAddress("::ffff:8.8.8.8")).toBe(false);
  });
});

describe("isDeniedAddress — not a literal IP", () => {
  it("denies rather than ignores something that isn't a resolved address", () => {
    // safe-fetch only ever calls this with DNS-resolved addresses; a bare
    // hostname reaching here would be a bug upstream, and failing closed is
    // the correct default for a function this security-sensitive.
    expect(isDeniedAddress("example.com")).toBe(true);
    expect(isDeniedAddress("not-an-ip")).toBe(true);
    expect(isDeniedAddress("")).toBe(true);
  });
});

describe("isInIpv4Range — /0 matches everything", () => {
  it("matches any address against a /0 network", () => {
    // The reason this needs its own branch: JS's `<<` is mod-32, so
    // `0xffffffff << 32` is a no-op, not zero, without the explicit guard.
    expect(isInIpv4Range("8.8.8.8", "0.0.0.0", 0)).toBe(true);
    expect(isInIpv4Range("255.255.255.255", "0.0.0.0", 0)).toBe(true);
  });
});

describe("isInIpv6Range — /0 matches everything", () => {
  it("matches any address against a /0 network", () => {
    expect(isInIpv6Range("2001:db8::1", "::", 0)).toBe(true);
    expect(isInIpv6Range("::1", "::", 0)).toBe(true);
  });
});

describe("isDeniedAddress — zone id", () => {
  it("denies a link-local address with a zone id (fe80::1%eth0)", () => {
    // net.isIP accepts these; confirmed via a quick node -e check before
    // relying on it here rather than assuming.
    expect(isDeniedAddress("fe80::1%eth0")).toBe(true);
  });
});
