import { createServer, type Server } from "node:http";
import { lookup } from "node:dns/promises";
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defaultResolveHost,
  defaultTransport,
  pinnedLookup,
  safeFetch,
  SafeFetchError,
  type SafeFetchDeps,
} from "./safe-fetch";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));

const PUBLIC = { address: "93.184.216.34", family: 4 as const };
const LOOPBACK = { address: "127.0.0.1", family: 4 as const };
const PRIVATE = { address: "10.0.0.5", family: 4 as const };

function htmlResponse(body = "<html></html>") {
  return {
    statusCode: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    body: (async function* () {
      yield Buffer.from(body);
    })(),
  };
}

function redirectResponse(location: string) {
  return {
    statusCode: 302,
    headers: { location },
    body: (async function* () {})(),
  };
}

const baseOptions = { allowedContentTypePrefixes: ["text/html"], maxBytes: 1024, timeoutMs: 200 };

describe("safeFetch — happy path", () => {
  it("resolves, connects, and returns the body/content-type/final URL", async () => {
    const deps: SafeFetchDeps = {
      resolveHost: vi.fn().mockResolvedValue([PUBLIC]),
      transport: vi.fn().mockResolvedValue(htmlResponse("<title>Hi</title>")),
    };

    const result = await safeFetch("https://example.com/product", baseOptions, deps);

    expect(result.body.toString()).toBe("<title>Hi</title>");
    expect(result.contentType).toContain("text/html");
    expect(result.finalUrl).toBe("https://example.com/product");
  });

  it("connects to the resolved address, not the hostname", async () => {
    const transport = vi.fn().mockResolvedValue(htmlResponse());
    await safeFetch("https://example.com/", baseOptions, {
      resolveHost: vi.fn().mockResolvedValue([PUBLIC]),
      transport,
    });

    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({ connectAddress: PUBLIC.address, family: 4 }),
    );
  });
});

describe("safeFetch — scheme rejection", () => {
  it.each(["ftp://example.com/x", "file:///etc/passwd", "gopher://example.com/", "data:text/html,x"])(
    "rejects %s",
    async (url) => {
      await expect(safeFetch(url, baseOptions)).rejects.toBeInstanceOf(SafeFetchError);
    },
  );

  it("rejects a malformed URL", async () => {
    await expect(safeFetch("not a url at all", baseOptions)).rejects.toBeInstanceOf(SafeFetchError);
  });
});

describe("safeFetch — denied addresses", () => {
  it("rejects a hostname that resolves to a loopback address", async () => {
    await expect(
      safeFetch("http://internal.example/", baseOptions, {
        resolveHost: vi.fn().mockResolvedValue([LOOPBACK]),
        transport: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(SafeFetchError);
  });

  it("rejects — 'DNS rebinding' shape: one public address and one private one", async () => {
    // A naive "check only the first result" implementation would let this
    // through. Every resolved address must be safe, not just the first.
    const transport = vi.fn();
    await expect(
      safeFetch("http://rebind.example/", baseOptions, {
        resolveHost: vi.fn().mockResolvedValue([PUBLIC, PRIVATE]),
        transport,
      }),
    ).rejects.toBeInstanceOf(SafeFetchError);
    expect(transport).not.toHaveBeenCalled();
  });

  it("rejects a redirect target that resolves to a private address", async () => {
    const resolveHost = vi
      .fn()
      .mockResolvedValueOnce([PUBLIC]) // first hop: public
      .mockResolvedValueOnce([PRIVATE]); // redirect target: private

    const transport = vi.fn().mockResolvedValueOnce(redirectResponse("http://internal.example/admin"));

    await expect(
      safeFetch("https://example.com/", baseOptions, { resolveHost, transport }),
    ).rejects.toBeInstanceOf(SafeFetchError);
  });
});

describe("safeFetch — redirects", () => {
  it("follows up to 3 redirects, re-resolving and re-validating each hop", async () => {
    const resolveHost = vi.fn().mockResolvedValue([PUBLIC]);
    const transport = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse("https://example.com/2"))
      .mockResolvedValueOnce(redirectResponse("https://example.com/3"))
      .mockResolvedValueOnce(htmlResponse("final"));

    const result = await safeFetch("https://example.com/1", baseOptions, { resolveHost, transport });

    expect(result.body.toString()).toBe("final");
    expect(result.finalUrl).toBe("https://example.com/3");
    expect(resolveHost).toHaveBeenCalledTimes(3);
  });

  it("gives up after too many redirects", async () => {
    const transport = vi.fn().mockImplementation((params: { url: URL }) =>
      Promise.resolve(redirectResponse(`${params.url.toString()}x`)),
    );

    await expect(
      safeFetch("https://example.com/1", baseOptions, {
        resolveHost: vi.fn().mockResolvedValue([PUBLIC]),
        transport,
      }),
    ).rejects.toBeInstanceOf(SafeFetchError);
  });
});

describe("safeFetch — response limits", () => {
  it("rejects a response over the size limit", async () => {
    const bigBody = {
      statusCode: 200,
      headers: { "content-type": "text/html" },
      body: (async function* () {
        yield Buffer.alloc(2000, "a");
      })(),
    };

    await expect(
      safeFetch("https://example.com/", { ...baseOptions, maxBytes: 100 }, {
        resolveHost: vi.fn().mockResolvedValue([PUBLIC]),
        transport: vi.fn().mockResolvedValue(bigBody),
      }),
    ).rejects.toBeInstanceOf(SafeFetchError);
  });

  it("rejects a content type outside the allowlist", async () => {
    const jsonResponse = {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: (async function* () {
        yield Buffer.from("{}");
      })(),
    };

    await expect(
      safeFetch("https://example.com/", baseOptions, {
        resolveHost: vi.fn().mockResolvedValue([PUBLIC]),
        transport: vi.fn().mockResolvedValue(jsonResponse),
      }),
    ).rejects.toBeInstanceOf(SafeFetchError);
  });

  // Confirmed live against Amazon's real CDN: a genuine product page (a real
  // `<!doctype html>` body) served with no Content-Type header at all — not
  // a hypothetical. A missing header is "unknown," not "wrong," unlike the
  // present-but-mismatched case above.
  it("accepts a response with no Content-Type header at all", async () => {
    const noContentTypeResponse = {
      statusCode: 200,
      headers: {},
      body: (async function* () {
        yield Buffer.from("<!doctype html><title>ok</title>");
      })(),
    };

    const result = await safeFetch("https://example.com/", baseOptions, {
      resolveHost: vi.fn().mockResolvedValue([PUBLIC]),
      transport: vi.fn().mockResolvedValue(noContentTypeResponse),
    });

    expect(result.contentType).toBe("");
    expect(result.body.toString()).toContain("<title>ok</title>");
  });
});

describe("safeFetch — transport failure", () => {
  it("wraps a rejected connection (e.g. ECONNREFUSED) as a generic SafeFetchError", async () => {
    await expect(
      safeFetch("https://example.com/", baseOptions, {
        resolveHost: vi.fn().mockResolvedValue([PUBLIC]),
        transport: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 93.184.216.34:443")),
      }),
    ).rejects.toBeInstanceOf(SafeFetchError);
  });
});

describe("safeFetch — timeout", () => {
  it("gives up once the timeout elapses, even if the transport never resolves", async () => {
    await expect(
      safeFetch(
        "https://example.com/",
        { ...baseOptions, timeoutMs: 20 },
        {
          resolveHost: vi.fn().mockResolvedValue([PUBLIC]),
          transport: vi.fn().mockReturnValue(new Promise(() => {})),
        },
      ),
    ).rejects.toBeInstanceOf(SafeFetchError);
  });
});

describe("safeFetch — error messages never leak upstream detail", () => {
  it("always throws the same generic message, regardless of the underlying cause", async () => {
    expect.assertions(3);
    try {
      await safeFetch("https://example.com/", baseOptions, {
        resolveHost: vi.fn().mockRejectedValue(new Error("ECONNREFUSED 10.0.0.5:443")),
        transport: vi.fn(),
      });
    } catch (error) {
      expect(error).toBeInstanceOf(SafeFetchError);
      expect((error as SafeFetchError).message).toBe("Unable to fetch the requested URL");
      expect((error as SafeFetchError).message).not.toContain("ECONNREFUSED");
    }
  });
});

describe("pinnedLookup", () => {
  it("hands back the given address and family in the plain (single-address) form", () => {
    const callback = vi.fn();
    pinnedLookup("93.184.216.34", 4)("some-hostname", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
  });

  it("hands back an array of one in the { all: true } form Happy Eyeballs uses", () => {
    // Node 20+ enables autoSelectFamily by default, and its connection
    // racing calls `lookup` with `{ all: true }` expecting this shape —
    // missing it is exactly the bug a real fetch caught that every
    // stubbed-transport test in this file couldn't.
    const callback = vi.fn();
    pinnedLookup("93.184.216.34", 4)("some-hostname", { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [{ address: "93.184.216.34", family: 4 }]);
  });
});

describe("defaultResolveHost", () => {
  afterEach(() => {
    vi.mocked(lookup).mockReset();
  });

  it("maps dns.lookup's result shape into ResolvedAddress[]", async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "2001:db8::1", family: 6 },
    ] as never);

    const result = await defaultResolveHost("example.com");

    expect(result).toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2001:db8::1", family: 6 },
    ]);
    expect(lookup).toHaveBeenCalledWith("example.com", { all: true, verbatim: true });
  });
});

describe("defaultTransport", () => {
  let server: Server;
  let port: number;

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function listen(
    handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void,
  ) {
    server = createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;
  }

  // A real loopback server the test itself owns — not "network access" in
  // the sense the task means (no internet, no external DNS, no flakiness);
  // it's the only way to prove the pinned-`lookup` wiring and the Host
  // header actually work against Node's real http module, which every
  // stubbed-transport test above deliberately doesn't exercise.
  //
  // The URL uses the hostname "localhost", not the bare IP: Node 20+'s
  // autoSelectFamily (Happy Eyeballs) only requests `{ all: true }` from
  // `lookup` for a hostname that needs resolving — a literal IP skips
  // resolution entirely, which is exactly how the array-callback bug this
  // test now guards against went unnoticed by the original version of it.
  it("connects to the pinned address and receives a real response", async () => {
    await listen((req, res) => {
      res.writeHead(200, { "content-type": "text/plain", "x-received-host": req.headers.host ?? "" });
      res.end("hello");
    });

    const result = await defaultTransport({
      url: new URL(`http://localhost:${port}/`),
      connectAddress: "127.0.0.1",
      family: 4,
      timeoutMs: 2000,
      userAgent: "test-agent/1.0",
    });

    expect(result.statusCode).toBe(200);
    expect(result.headers["content-type"]).toBe("text/plain");
    expect(result.headers["x-received-host"]).toBe(`localhost:${port}`);

    const chunks: Buffer[] = [];
    for await (const chunk of result.body) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe("hello");
  });

  it("sends the given User-Agent header", async () => {
    let receivedUserAgent = "";
    await listen((req, res) => {
      receivedUserAgent = req.headers["user-agent"] ?? "";
      res.writeHead(200);
      res.end();
    });

    await defaultTransport({
      url: new URL(`http://127.0.0.1:${port}/`),
      connectAddress: "127.0.0.1",
      family: 4,
      timeoutMs: 2000,
      userAgent: "WishlistBot/1.0",
    });

    expect(receivedUserAgent).toBe("WishlistBot/1.0");
  });

  // Confirmed live against Amazon's real CDN (a compressed response with no
  // Accept-Encoding sent at all) before this was fixed — every OG field came
  // back null, ogStatus "ok", because the parser was fed raw gzip bytes it
  // silently misread as UTF-8 text. This exercises the real `zlib` decode
  // path, not a mock of it, the same way the loopback tests above exercise
  // the real pinned-`lookup` wiring.
  it("decompresses a real gzip response before handing it to the caller", async () => {
    const compressed = gzipSync(Buffer.from("hello from amazon"));
    await listen((_req, res) => {
      res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
      res.end(compressed);
    });

    const result = await defaultTransport({
      url: new URL(`http://localhost:${port}/`),
      connectAddress: "127.0.0.1",
      family: 4,
      timeoutMs: 2000,
      userAgent: "test-agent/1.0",
    });

    const chunks: Buffer[] = [];
    for await (const chunk of result.body) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe("hello from amazon");
  });

  it("decompresses a real brotli response", async () => {
    const compressed = brotliCompressSync(Buffer.from("brotli body"));
    await listen((_req, res) => {
      res.writeHead(200, { "content-encoding": "br" });
      res.end(compressed);
    });

    const result = await defaultTransport({
      url: new URL(`http://localhost:${port}/`),
      connectAddress: "127.0.0.1",
      family: 4,
      timeoutMs: 2000,
      userAgent: "test-agent/1.0",
    });

    const chunks: Buffer[] = [];
    for await (const chunk of result.body) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe("brotli body");
  });

  it("decompresses a real deflate response", async () => {
    const compressed = deflateSync(Buffer.from("deflate body"));
    await listen((_req, res) => {
      res.writeHead(200, { "content-encoding": "deflate" });
      res.end(compressed);
    });

    const result = await defaultTransport({
      url: new URL(`http://localhost:${port}/`),
      connectAddress: "127.0.0.1",
      family: 4,
      timeoutMs: 2000,
      userAgent: "test-agent/1.0",
    });

    const chunks: Buffer[] = [];
    for await (const chunk of result.body) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe("deflate body");
  });

  it("declares Accept-Encoding so a well-behaved server knows it may compress", async () => {
    let receivedAcceptEncoding = "";
    await listen((req, res) => {
      receivedAcceptEncoding = req.headers["accept-encoding"] ?? "";
      res.writeHead(200);
      res.end();
    });

    await defaultTransport({
      url: new URL(`http://127.0.0.1:${port}/`),
      connectAddress: "127.0.0.1",
      family: 4,
      timeoutMs: 2000,
      userAgent: "test-agent/1.0",
    });

    expect(receivedAcceptEncoding).toBe("gzip, deflate, br");
  });

  it("rejects when the socket times out", async () => {
    await listen(() => {
      // Never responds.
    });

    await expect(
      defaultTransport({
        url: new URL(`http://127.0.0.1:${port}/`),
        connectAddress: "127.0.0.1",
        family: 4,
        timeoutMs: 50,
        userAgent: "test-agent/1.0",
      }),
    ).rejects.toThrow();
  });
});
