import { readFile } from "node:fs/promises";
import path from "node:path";

import { config } from "@/server/config";
import { isValidImageFilename } from "@/server/og/image";

type Context = { params: Promise<{ filename: string }> };

/**
 * `GET /media/:filename` — public, no auth: item images must render for
 * anonymous visitors on a shared list, same as the list itself.
 *
 * The filename is checked against `isValidImageFilename()` before it ever
 * touches `path.join` — a regex match, not a sanitizer, so there's nothing
 * for `../../etc/passwd`-style input to survive.
 */
export async function GET(_request: Request, { params }: Context) {
  const { filename } = await params;
  if (!isValidImageFilename(filename)) {
    return new Response(null, { status: 404 });
  }

  try {
    const file = await readFile(path.join(config.IMAGE_STORAGE_PATH, filename));
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
