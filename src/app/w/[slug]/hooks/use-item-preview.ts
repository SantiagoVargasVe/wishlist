import { useEffect, useRef } from "react";
import type { UseFormSetValue } from "react-hook-form";

import { usePreviewQuery } from "@/lib/api/queries";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { previewSchema } from "@/lib/schemas/preview";
import type { CreateItemInput } from "@/lib/schemas/item";

/**
 * Owns the "paste a URL, get a live preview, prefill the form" flow —
 * design-system.md's rule that a `useEffect` with real logic in a component
 * is a hook trying to exist.
 *
 * Debounces the raw `url` field, only queries once it's a schema-valid URL
 * (typing "https://exa" shouldn't spend a preview-rate-limit slot), and
 * prefills title/price/currency/imageUrl **once per resolved URL** —
 * tracked by a ref, not a render-time check, so a user who edits a
 * prefilled title right after the scrape lands doesn't have their edit
 * silently clobbered by a later render of the same query result.
 * `imageUrl` isn't rendered from the form itself (`ItemPreviewField` reads
 * it straight off `preview.data`) — it only needs to land in form state so
 * submit actually sends it to `downloadItemImage()` (T033).
 *
 * `fieldsEnabled` (T082) is what the rest of the form gates title/notes/
 * price/currency/lists on — true only once there's a valid URL *and* its
 * preview query has settled, success or failure. Gating on settling rather
 * than on `validUrl` alone matters: unlocking the instant the URL becomes
 * valid would let a fast typist start editing `title` before the prefill
 * effect above fires, and have that edit silently overwritten a moment
 * later when `preview.data` arrives. By the time `isFetching` goes false,
 * the prefill (or its absence, on a failed scrape) has already happened, so
 * there's nothing left to clobber. A failed scrape still sets this true —
 * non-negotiable #2, a bad OG fetch is never a reason to block manual entry.
 */
export function useItemPreview(url: string, setValue: UseFormSetValue<CreateItemInput>) {
  const debouncedUrl = useDebouncedValue(url, 500);
  const validUrl = previewSchema.safeParse({ url: debouncedUrl }).success ? debouncedUrl : null;
  const preview = usePreviewQuery(validUrl);
  const prefilledFor = useRef<string | null>(null);

  useEffect(() => {
    if (!validUrl || !preview.data || prefilledFor.current === validUrl) return;
    prefilledFor.current = validUrl;

    if (preview.data.title) setValue("title", preview.data.title);
    if (preview.data.imageUrl) setValue("imageUrl", preview.data.imageUrl);
    if (preview.data.price && preview.data.currency) {
      setValue("priceAmount", preview.data.price);
      setValue("priceCurrency", preview.data.currency as "COP" | "USD");
    }
  }, [validUrl, preview.data, setValue]);

  return { ...preview, fieldsEnabled: validUrl !== null && !preview.isFetching };
}
