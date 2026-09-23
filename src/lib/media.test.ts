import { describe, expect, it } from "vitest";

import { mediaUrl } from "./media";

describe("mediaUrl", () => {
  it("points at the /media route with a version, so rewritten images get a fresh cache key", () => {
    expect(mediaUrl("abc.webp")).toMatch(/^\/media\/abc\.webp\?v=\d+$/);
  });
});
