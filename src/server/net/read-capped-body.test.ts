import { describe, expect, it } from "vitest";

import { EmptyBodyError, PayloadTooLargeError, readCappedBody } from "./read-capped-body";

/**
 * `contentLength` is set independently of the real body on purpose — the
 * header is a client claim, and these tests exist to prove the stream is what
 * actually enforces the cap.
 */
function request(body: Uint8Array | null, contentLength?: string | null): Request {
  const headers = new Headers();
  if (contentLength !== null && contentLength !== undefined) {
    headers.set("content-length", contentLength);
  }

  const stream =
    body === null
      ? null
      : new ReadableStream<Uint8Array>({
          start(controller) {
            // Several chunks, so the running total is exercised rather than a
            // single length check.
            for (let i = 0; i < body.length; i += 16) {
              controller.enqueue(body.slice(i, i + 16));
            }
            controller.close();
          },
        });

  return new Request("https://example.test/upload", {
    method: "POST",
    body: stream,
    headers,
    // Required by undici whenever a stream is used as a body.
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("readCappedBody", () => {
  it("returns the whole body when it fits", async () => {
    const payload = new Uint8Array(100).fill(7);
    const result = await readCappedBody(request(payload), 1000);

    expect(result).toHaveLength(100);
    expect(result.every((b) => b === 7)).toBe(true);
  });

  it("accepts a body exactly at the limit", async () => {
    const result = await readCappedBody(request(new Uint8Array(64).fill(1)), 64);
    expect(result).toHaveLength(64);
  });

  it("rejects a body one byte over the limit", async () => {
    await expect(readCappedBody(request(new Uint8Array(65)), 64)).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    );
  });

  it("rejects early when Content-Length already exceeds the limit", async () => {
    await expect(
      readCappedBody(request(new Uint8Array(10), "999999"), 64),
    ).rejects.toBeInstanceOf(PayloadTooLargeError);
  });

  // The header is a claim, not a fact. A client that understates it must still
  // be cut off by the running total — otherwise the cap is trivially bypassed.
  it("still enforces the cap when Content-Length lies about a small body", async () => {
    await expect(readCappedBody(request(new Uint8Array(500), "10"), 64)).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    );
  });

  it("still enforces the cap when Content-Length is absent entirely", async () => {
    await expect(readCappedBody(request(new Uint8Array(500), null), 64)).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    );
  });

  it("rejects a zero-length body", async () => {
    await expect(readCappedBody(request(new Uint8Array(0)), 64)).rejects.toBeInstanceOf(
      EmptyBodyError,
    );
  });

  it("rejects a request with no body at all", async () => {
    await expect(readCappedBody(request(null), 64)).rejects.toBeInstanceOf(EmptyBodyError);
  });

  it("reports the configured limit on the error, so the caller can tell the user", async () => {
    const error = await readCappedBody(request(new Uint8Array(200)), 64).catch((e) => e);
    expect(error).toBeInstanceOf(PayloadTooLargeError);
    expect((error as PayloadTooLargeError).maxBytes).toBe(64);
  });
});
