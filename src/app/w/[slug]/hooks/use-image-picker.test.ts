import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { imageFromDataTransfer, isSupportedImage, useImagePicker } from "./use-image-picker";

function blob(type: string, bytes = 8): Blob {
  return new Blob([new Uint8Array(bytes)], { type });
}

describe("isSupportedImage", () => {
  it.each(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic"])(
    "accepts %s",
    (type) => expect(isSupportedImage(blob(type))).toBe(true),
  );

  // The server rejects SVG because sharp renders it through librsvg, which
  // honours external references. Rejecting it here too means the user finds
  // out immediately instead of after an upload round-trip.
  it("rejects SVG", () => {
    expect(isSupportedImage(blob("image/svg+xml"))).toBe(false);
  });

  it.each(["application/pdf", "text/html", "", "application/octet-stream"])(
    "rejects %s",
    (type) => expect(isSupportedImage(blob(type))).toBe(false),
  );
});

describe("imageFromDataTransfer", () => {
  function dataTransfer(files: File[], items: { kind: string; type: string; file?: File }[] = []) {
    return {
      files,
      items: items.map((i) => ({ ...i, getAsFile: () => i.file ?? null })),
    } as unknown as DataTransfer;
  }

  it("returns null when there's nothing transferred", () => {
    expect(imageFromDataTransfer(null)).toBeNull();
  });

  it("picks an image file out of a drop", () => {
    const png = new File([new Uint8Array(4)], "a.png", { type: "image/png" });
    expect(imageFromDataTransfer(dataTransfer([png]))).toBe(png);
  });

  it("ignores a non-image file", () => {
    const pdf = new File([new Uint8Array(4)], "a.pdf", { type: "application/pdf" });
    expect(imageFromDataTransfer(dataTransfer([pdf]))).toBeNull();
  });

  // Pasting a copied image from a browser produces a clipboard item with no
  // entry in `files` at all — the case a files-only reader would miss.
  it("finds a pasted bitmap that has no file entry", () => {
    const png = new File([new Uint8Array(4)], "clip.png", { type: "image/png" });
    const transfer = dataTransfer([], [{ kind: "file", type: "image/png", file: png }]);
    expect(imageFromDataTransfer(transfer)).toBe(png);
  });

  it("ignores a pasted string item", () => {
    const transfer = dataTransfer([], [{ kind: "string", type: "text/plain" }]);
    expect(imageFromDataTransfer(transfer)).toBeNull();
  });
});

describe("useImagePicker", () => {
  const created: string[] = [];
  const revoked: string[] = [];
  let counter = 0;

  // Installed once for the file rather than stubbed per test: React flushes an
  // unmount's cleanup *after* afterEach hooks run, so a stub torn down there
  // leaves `revokeObjectURL` undefined exactly when the hook calls it. jsdom
  // implements neither method, so there is nothing real to preserve.
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:mock/${counter++}`;
    created.push(url);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });

  beforeEach(() => {
    created.length = 0;
    revoked.length = 0;
  });

  it("starts with nothing picked", () => {
    const { result } = renderHook(() => useImagePicker());
    expect(result.current.picked).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("holds a picked blob with a preview URL", () => {
    const { result } = renderHook(() => useImagePicker());
    const file = blob("image/png");

    act(() => result.current.pickBlob(file));

    expect(result.current.picked).toEqual({
      kind: "blob",
      blob: file,
      previewUrl: created[0],
    });
  });

  it("reports an unsupported file instead of picking it", () => {
    const { result } = renderHook(() => useImagePicker());

    act(() => result.current.pickBlob(blob("image/svg+xml")));

    expect(result.current.error).toBe("unsupported");
    expect(result.current.picked).toBeNull();
    expect(created).toHaveLength(0);
  });

  // The leak this hook exists to prevent: without it, picking four photos in a
  // row holds all four in memory until unmount.
  it("revokes the previous object URL when a new blob replaces it", () => {
    const { result } = renderHook(() => useImagePicker());

    act(() => result.current.pickBlob(blob("image/png")));
    act(() => result.current.pickBlob(blob("image/jpeg")));

    expect(revoked).toEqual([created[0]]);
    expect(result.current.picked).toMatchObject({ previewUrl: created[1] });
  });

  it("revokes the object URL on clear", () => {
    const { result } = renderHook(() => useImagePicker());

    act(() => result.current.pickBlob(blob("image/png")));
    act(() => result.current.clear());

    expect(revoked).toEqual([created[0]]);
    expect(result.current.picked).toBeNull();
  });

  it("revokes the object URL on unmount", () => {
    const { result, unmount } = renderHook(() => useImagePicker());
    act(() => result.current.pickBlob(blob("image/png")));

    unmount();

    expect(revoked).toEqual([created[0]]);
  });

  it("switching from a blob to a URL releases the blob preview", () => {
    const { result } = renderHook(() => useImagePicker());

    act(() => result.current.pickBlob(blob("image/png")));
    act(() => result.current.pickUrl("https://cdn.example/a.jpg"));

    expect(revoked).toEqual([created[0]]);
    expect(result.current.picked).toEqual({ kind: "url", url: "https://cdn.example/a.jpg" });
  });

  it("treats an emptied URL field as nothing picked", () => {
    const { result } = renderHook(() => useImagePicker());

    act(() => result.current.pickUrl("https://cdn.example/a.jpg"));
    act(() => result.current.pickUrl(""));

    expect(result.current.picked).toBeNull();
  });

  it("clears a previous error once a supported file is picked", () => {
    const { result } = renderHook(() => useImagePicker());

    act(() => result.current.pickBlob(blob("application/pdf")));
    expect(result.current.error).toBe("unsupported");

    act(() => result.current.pickBlob(blob("image/png")));
    expect(result.current.error).toBeNull();
  });
});
