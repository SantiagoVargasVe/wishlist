import "server-only";

/** The body exceeded the cap. Callers map this to their own domain error. */
export class PayloadTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super("payload exceeded the size limit");
    this.name = "PayloadTooLargeError";
  }
}

/** There was no body at all, or it was zero bytes. */
export class EmptyBodyError extends Error {
  constructor() {
    super("empty request body");
    this.name = "EmptyBodyError";
  }
}

/**
 * Reads a request body, refusing to buffer more than `maxBytes`.
 *
 * `request.arrayBuffer()` / `request.formData()` would buffer the entire body
 * first and only then let anything measure it — which is the denial of
 * service, not the defence against it. This aborts mid-stream instead, the
 * same shape as `safe-fetch`'s `readWithLimit` for outbound responses.
 *
 * `Content-Length` is a *claim* made by the client, so it is used only as a
 * cheap early exit: a chunked upload can omit the header entirely, or simply
 * lie about it. The running total over the stream is what actually enforces
 * the limit.
 */
export async function readCappedBody(request: Request, maxBytes: number): Promise<Buffer> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new PayloadTooLargeError(maxBytes);
  }

  const reader = request.body?.getReader();
  if (!reader) throw new EmptyBodyError();

  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new PayloadTooLargeError(maxBytes);
    }
    chunks.push(value);
  }

  if (total === 0) throw new EmptyBodyError();
  return Buffer.concat(chunks);
}
