import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { mediaUrl } from "@/lib/media";

import { ItemImage } from "./item-image";

describe("ItemImage", () => {
  it("loads the stored image through its versioned media URL", () => {
    const { container } = render(<ItemImage imagePath="abc.webp" />);
    // `alt=""` means the <img> has no `img` role — select it directly.
    const img = container.querySelector("img");
    // next/image routes it through the optimizer, so the URL arrives encoded.
    expect(img?.getAttribute("src")).toContain(encodeURIComponent(mediaUrl("abc.webp")));
  });

  it("fills a frame it doesn't size — a tall image can't stretch the card", () => {
    const { container } = render(<ItemImage imagePath="abc.webp" />);
    // `fill` takes the image out of flow; there are no intrinsic dimensions
    // left for the frame to grow around.
    const img = container.querySelector("img");
    expect(img).not.toHaveAttribute("width");
    expect(img).not.toHaveAttribute("height");
    expect(img).toHaveStyle({ position: "absolute" });
  });

  it("shows the placeholder when there is no image", () => {
    render(<ItemImage imagePath={null} />);
    expect(screen.getByText("Sin imagen")).toBeInTheDocument();
  });

  it("renders its children over the image — the visitor card's claimed badge", () => {
    render(
      <ItemImage imagePath="abc.webp">
        <span>Comprado</span>
      </ItemImage>,
    );
    expect(screen.getByText("Comprado")).toBeInTheDocument();
  });
});
