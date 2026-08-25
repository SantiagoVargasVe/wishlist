import { useCallback, useEffect, useRef, useState } from "react";

/**
 * What the user has chosen, if anything. A URL is sent as a field on the item
 * itself and downloaded server-side; a blob is uploaded to
 * `POST /api/items/:id/image` after the item exists. Two shapes rather than
 * one because they leave by different routes.
 */
export type PickedImage =
  | { kind: "url"; url: string }
  | { kind: "blob"; blob: Blob; previewUrl: string };

/** Only what the app can actually store — mirrors the server's allowlist, minus SVG. */
const ACCEPTED = /^image\/(jpeg|png|webp|gif|avif|heic|heif|tiff)$/i;

/** Narrow union so the UI can map each case to a real translation key. */
export type ImagePickerError = "unsupported" | "tooLarge";

export function isSupportedImage(blob: Blob): boolean {
  return ACCEPTED.test(blob.type);
}

/**
 * Owns the "which picture, and where did it come from" state for the add and
 * edit forms.
 *
 * The blob preview is an object URL, which is a real resource leak if it isn't
 * revoked — a phone photo held in memory is measured in megabytes. A ref
 * tracks the live one so replacing a selection frees the previous URL rather
 * than only cleaning up on unmount, which is where a naive `useEffect`
 * cleanup would leave a user who picks four photos in a row holding all four.
 */
export function useImagePicker(): {
  picked: PickedImage | null;
  error: ImagePickerError | null;
  pickBlob: (blob: Blob) => void;
  pickUrl: (url: string) => void;
  clear: () => void;
} {
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [error, setError] = useState<ImagePickerError | null>(null);
  const objectUrl = useRef<string | null>(null);

  const release = useCallback(() => {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
  }, []);

  useEffect(() => release, [release]);

  const pickBlob = useCallback(
    (blob: Blob) => {
      if (!isSupportedImage(blob)) {
        setError("unsupported");
        return;
      }
      release();
      const previewUrl = URL.createObjectURL(blob);
      objectUrl.current = previewUrl;
      setError(null);
      setPicked({ kind: "blob", blob, previewUrl });
    },
    [release],
  );

  const pickUrl = useCallback(
    (url: string) => {
      release();
      setError(null);
      setPicked(url ? { kind: "url", url } : null);
    },
    [release],
  );

  const clear = useCallback(() => {
    release();
    setError(null);
    setPicked(null);
  }, [release]);

  return { picked, error, pickBlob, pickUrl, clear };
}

/**
 * Pulls the first image out of a paste or drop. Both `ClipboardEvent` and
 * `DragEvent` expose a `DataTransfer`, so one reader serves both — a
 * screenshot pasted with Cmd/Ctrl+V and a file dragged onto the drop zone are
 * the same thing by the time they reach here.
 *
 * Note the two lists: `files` covers a real file, while `items` covers a
 * clipboard bitmap that has no file behind it at all, which is what pasting a
 * copied image from a browser produces.
 */
export function imageFromDataTransfer(data: DataTransfer | null): Blob | null {
  if (!data) return null;

  for (const file of Array.from(data.files)) {
    if (file.type.startsWith("image/")) return file;
  }

  for (const item of Array.from(data.items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }

  return null;
}
