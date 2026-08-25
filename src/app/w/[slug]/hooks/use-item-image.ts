import { Toast } from "@/app/_ui/toast";
import { useUploadItemImageMutation } from "@/lib/api/queries";
import { t } from "@/lib/i18n";

import { useImagePicker } from "./use-image-picker";

/**
 * Joins the picker to the save flow, because the two ways an image arrives
 * leave by different routes and the form shouldn't have to know that: a URL
 * rides along on the item itself and is downloaded server-side, while a blob
 * has to be uploaded *after* the item exists and has an id.
 *
 * Kept out of the forms deliberately — `add-item-form.tsx` has already been
 * touched by four tasks and sits near the 100-line ceiling.
 */
export function useItemImage() {
  const picker = useImagePicker();
  const upload = useUploadItemImageMutation();
  const toastManager = Toast.useToastManager();

  /**
   * What to send as the item's own `imageUrl`.
   *
   * A picked blob suppresses it entirely: leaving the scraped URL in place
   * would start a server-side download that races the upload, and whichever
   * finished last would win — so the user's explicit choice could silently
   * lose to a scrape they were trying to override.
   */
  function imageUrlFor(scrapedUrl: string | undefined): string | undefined {
    if (picker.picked?.kind === "blob") return undefined;
    if (picker.picked?.kind === "url") return picker.picked.url;
    return scrapedUrl;
  }

  /**
   * Uploads a picked blob once the item exists.
   *
   * Never rethrows. The item is already saved by this point, so a failed
   * upload must not read as a failed save — non-negotiable #2, an image is a
   * nicety and never a gate. The user is told via a toast rather than a form
   * error, since the form is about to close and a message inside it would go
   * with it.
   */
  async function uploadTo(itemId: string): Promise<void> {
    if (picker.picked?.kind !== "blob") return;
    try {
      await upload.mutateAsync({ id: itemId, blob: picker.picked.blob });
    } catch {
      toastManager.add({ type: "error", title: t("wishlist.itemImage.errors.uploadFailed") });
    }
  }

  /** Whether an image is on its way, and a delayed refresh is therefore worth scheduling. */
  function hasPendingImage(scrapedUrl: string | undefined): boolean {
    return picker.picked !== null || Boolean(scrapedUrl);
  }

  return { ...picker, imageUrlFor, uploadTo, hasPendingImage, isUploading: upload.isPending };
}
