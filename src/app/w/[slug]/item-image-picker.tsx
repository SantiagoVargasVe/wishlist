"use client";

import { useId, useState } from "react";

import { Input } from "@/app/_ui/input";
import { t } from "@/lib/i18n";

import type { ImagePickerError, PickedImage } from "./hooks/use-image-picker";
import { ImageDropZone } from "./image-drop-zone";

/**
 * Explicit rather than a template key: `t()` is typed against the literal key
 * union, so a computed `errors.${code}` would type-check as `string` and let a
 * missing translation ship silently.
 */
const ERROR_KEYS = {
  unsupported: "wishlist.itemImage.errors.unsupported",
  tooLarge: "wishlist.itemImage.errors.tooLarge",
} as const;

/**
 * The three ways a picture gets in — drop or pick a file, paste from the
 * clipboard, or paste an image URL — kept in one control so phone and laptop
 * reach the same feature by whichever route suits them. On a phone, tapping
 * opens the camera roll; on a laptop, right-click-copy-image then Ctrl+V is
 * the fast path; the URL field covers "copy image address".
 *
 * `scrapedUrl` is whatever the OG scrape found. Anything picked here overrides
 * it, so this corrects a *wrong* scraped image as well as supplying a missing
 * one.
 */
export function ItemImagePicker({
  picked,
  scrapedUrl,
  error,
  disabled,
  onPickBlob,
  onPickUrl,
  onClear,
}: {
  picked: PickedImage | null;
  scrapedUrl?: string | null;
  error?: ImagePickerError | null;
  disabled?: boolean;
  onPickBlob: (blob: Blob) => void;
  onPickUrl: (url: string) => void;
  onClear: () => void;
}) {
  const [urlDraft, setUrlDraft] = useState("");
  const urlFieldId = useId();

  const shown = picked?.kind === "blob" ? picked.previewUrl : (picked?.url ?? scrapedUrl ?? null);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{t("wishlist.itemImage.label")}</span>

      <ImageDropZone previewUrl={shown} disabled={disabled} onPick={onPickBlob} />

      <label htmlFor={urlFieldId} className="text-xs text-muted-foreground">
        {t("wishlist.itemImage.orPasteUrl")}
      </label>
      <Input
        id={urlFieldId}
        type="url"
        inputMode="url"
        autoComplete="off"
        disabled={disabled}
        placeholder={t("wishlist.itemImage.urlPlaceholder")}
        value={urlDraft}
        onChange={(e) => {
          setUrlDraft(e.target.value);
          onPickUrl(e.target.value.trim());
        }}
      />

      {shown && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setUrlDraft("");
            onClear();
          }}
          className="self-start text-xs text-muted-foreground underline"
        >
          {t("wishlist.itemImage.remove")}
        </button>
      )}

      {error && <p className="text-sm text-destructive">{t(ERROR_KEYS[error])}</p>}
    </div>
  );
}
