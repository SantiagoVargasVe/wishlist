import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { mediaUrl } from "@/lib/media";

import { ItemImage } from "./item-image";

const stored = new Date("2026-09-01T10:00:00.000Z");

/** `alt=""` means the <img> has no `img` role — select it directly. */
function imageSrc(container: HTMLElement): string | null | undefined {
  return container.querySelector("img")?.getAttribute("src");
}

describe("ItemImage", () => {
  it("loads the stored image through its versioned media URL", () => {
    const { container } = render(<ItemImage imagePath="abc.webp" imageVersion={stored} />);
    // next/image routes it through the optimizer, so the URL arrives encoded.
    expect(imageSrc(container)).toContain(encodeURIComponent(mediaUrl("abc.webp", stored)));
  });

  // T115: same filename, new picture — the optimizer and the browser only
  // fetch it again if the URL moves.
  it("requests a new URL once the item's image has been replaced", () => {
    const before = imageSrc(render(<ItemImage imagePath="abc.webp" imageVersion={stored} />).container);
    const replaced = new Date(stored.getTime() + 60_000);
    const after = imageSrc(render(<ItemImage imagePath="abc.webp" imageVersion={replaced} />).container);
    expect(after).not.toBe(before);
  });

  it("fills a frame it doesn't size — a tall image can't stretch the card", () => {
    const { container } = render(<ItemImage imagePath="abc.webp" imageVersion={stored} />);
    // `fill` takes the image out of flow; there are no intrinsic dimensions
    // left for the frame to grow around.
    const img = container.querySelector("img");
    expect(img).not.toHaveAttribute("width");
    expect(img).not.toHaveAttribute("height");
    expect(img).toHaveStyle({ position: "absolute" });
  });

  it("shows the placeholder when there is no image", () => {
    render(<ItemImage imagePath={null} imageVersion={null} />);
    expect(screen.getByText("Sin imagen")).toBeInTheDocument();
  });

  it("renders its children over the image — the visitor card's claimed badge", () => {
    render(
      <ItemImage imagePath="abc.webp" imageVersion={stored}>
        <span>Comprado</span>
      </ItemImage>,
    );
    expect(screen.getByText("Comprado")).toBeInTheDocument();
  });
});
