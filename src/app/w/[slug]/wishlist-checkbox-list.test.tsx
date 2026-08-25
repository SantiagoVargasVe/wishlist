import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import type { CreateItemInput } from "@/lib/schemas/item";
import type { PublicWishlist } from "@/server/services/wishlists";

import { WishlistCheckboxList } from "./wishlist-checkbox-list";

const wishlists: PublicWishlist[] = [
  { id: "w1", slug: "s1", title: "Cumpleaños", isDefault: true, hideClaimsFromOwner: false },
  { id: "w2", slug: "s2", title: "Boda", isDefault: false, hideClaimsFromOwner: false },
];

function useHarnessForm(wishlistIds: string[]) {
  return useForm<CreateItemInput>({ defaultValues: { url: "", title: "", wishlistIds } });
}

function Harness({ onChange }: { onChange: (ids: string[]) => void }) {
  const { control, watch } = useHarnessForm(["w1"]);
  onChange(watch("wishlistIds"));

  return <WishlistCheckboxList control={control} wishlists={wishlists} />;
}

describe("WishlistCheckboxList", () => {
  it("starts with the default-checked list checked and the other unchecked", () => {
    render(<Harness onChange={vi.fn()} />);

    expect(screen.getByRole("checkbox", { name: "Cumpleaños" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Boda" })).not.toBeChecked();
  });

  it("adds a list's id when it's checked", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.click(screen.getByRole("checkbox", { name: "Boda" }));

    expect(onChange).toHaveBeenLastCalledWith(["w1", "w2"]);
  });

  it("removes a list's id when it's unchecked", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.click(screen.getByRole("checkbox", { name: "Cumpleaños" }));

    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("shows the error message when passed one", () => {
    function ErrorHarness() {
      const { control } = useHarnessForm([]);
      return (
        <WishlistCheckboxList control={control} wishlists={wishlists} error="Elige al menos una lista" />
      );
    }
    render(<ErrorHarness />);

    expect(screen.getByRole("alert")).toHaveTextContent("Elige al menos una lista");
  });
});
