"use client";

import Image from "next/image";
import { useRef, useState } from "react";

import { t } from "@/lib/i18n";

import { imageFromDataTransfer } from "./hooks/use-image-picker";

/**
 * Drop / paste / tap-to-pick, plus the preview of whatever is currently
 * chosen. A `<button>` rather than a bare `<div>` on purpose: dragging is
 * pointer-only, so without a focusable control the whole feature would be
 * unreachable by keyboard, and on a phone there is no drag gesture at all —
 * tapping to open the camera roll is the only route in.
 */
export function ImageDropZone({
  previewUrl,
  disabled,
  onPick,
}: {
  previewUrl: string | null;
  disabled?: boolean;
  onPick: (blob: Blob) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function take(blob: Blob | null) {
    if (blob) onPick(blob);
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => fileInput.current?.click()}
        onPaste={(e) => take(imageFromDataTransfer(e.clipboardData))}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          take(imageFromDataTransfer(e.dataTransfer));
        }}
        className={`flex min-h-32 flex-col items-center justify-center gap-2 rounded-md border border-dashed p-3 text-sm transition-colors ${
          dragOver ? "border-primary bg-muted" : "border-border"
        } ${disabled ? "opacity-50" : "hover:bg-muted"}`}
      >
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt={t("wishlist.itemImage.preview")}
            width={160}
            height={160}
            unoptimized
            className="max-h-28 w-auto rounded object-contain"
          />
        ) : (
          <span className="text-center text-muted-foreground">
            {t("wishlist.itemImage.dropHint")}
          </span>
        )}
      </button>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          take(e.target.files?.[0] ?? null);
          // Reset so re-picking the same file still fires a change event.
          e.target.value = "";
        }}
      />
    </>
  );
}
