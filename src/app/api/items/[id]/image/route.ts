import { requireUserId } from "@/server/auth/session";
import { config } from "@/server/config";
import { ItemErrors } from "@/server/errors";
import {
  EmptyBodyError,
  PayloadTooLargeError,
  readCappedBody,
} from "@/server/net/read-capped-body";
import { ImageRejectedError, storeUploadedItemImage } from "@/server/og/image";
import { assertItemOwned } from "@/server/services/items";

import { handle } from "../../../_lib/respond";

type Context = { params: Promise<{ id: string }> };

/**
 * `POST /api/items/:id/image` — owner only. Replaces the item's picture with
 * bytes the user supplied directly: a picked file, a dragged file, or an image
 * pasted from the clipboard, which all arrive as the same raw body.
 *
 * Raw bytes rather than `multipart/form-data`: there is exactly one field, and
 * `request.formData()` buffers the whole payload before anything can measure
 * it — which is precisely the limit that needs applying first.
 *
 * Ownership is asserted **before** the body is read, so an upload from a
 * stranger costs one indexed lookup rather than several megabytes of memory.
 */
export const POST = handle(async (request, { params }: Context) => {
  const userId = await requireUserId();
  const { id } = await params;

  await assertItemOwned(id, userId);

  let buffer: Buffer;
  try {
    buffer = await readCappedBody(request, config.IMAGE_MAX_UPLOAD_BYTES);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      throw ItemErrors.imageTooLarge(error.maxBytes);
    }
    if (error instanceof EmptyBodyError) {
      throw ItemErrors.imageRejected("No image was uploaded");
    }
    throw error;
  }

  try {
    await storeUploadedItemImage(id, buffer);
  } catch (error) {
    if (error instanceof ImageRejectedError) {
      // The real reason goes to the log. The client is told to pick something
      // else, without a description of what the decoder will accept.
      console.error(`image upload rejected for item ${id}:`, error.message);
      throw ItemErrors.imageRejected("That file isn't a supported image");
    }
    throw error;
  }

  return new Response(null, { status: 204 });
});
