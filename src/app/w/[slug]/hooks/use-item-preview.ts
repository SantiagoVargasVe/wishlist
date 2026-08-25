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
 * prefills title/price/currency **once per resolved URL** — tracked by a
 * ref, not a render-time check, so a user who edits a prefilled title right
 * after the scrape lands doesn't have their edit silently clobbered by a
 * later render of the same query result.
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
    if (preview.data.price && preview.data.currency) {
      setValue("priceAmount", preview.data.price);
      setValue("priceCurrency", preview.data.currency as "COP" | "USD");
    }
  }, [validUrl, preview.data, setValue]);

  return preview;
}
