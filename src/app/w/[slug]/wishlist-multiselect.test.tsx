import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import type { CreateItemInput } from "@/lib/schemas/item";
import type { PublicWishlist } from "@/server/services/wishlists";

import { WishlistMultiSelect } from "./wishlist-multiselect";

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

  return <WishlistMultiSelect control={control} wishlists={wishlists} />;
}

describe("WishlistMultiSelect", () => {
  it("starts with the default-selected list shown as a chip", () => {
    render(<Harness onChange={vi.fn()} />);

    expect(screen.getByText("Cumpleaños")).toBeInTheDocument();
    expect(screen.queryByText("Boda")).not.toBeInTheDocument();
  });

  it("filters the option list as the user types", async () => {
    render(<Harness onChange={vi.fn()} />);
    const input = screen.getByRole("combobox");

    await userEvent.click(input);
    await userEvent.type(input, "Bod");

    expect(await screen.findByRole("option", { name: "Boda" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Cumpleaños" })).not.toBeInTheDocument();
  });

  it("adds a wishlist's id when its option is selected", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole("combobox");

    await userEvent.click(input);
    await userEvent.click(await screen.findByRole("option", { name: "Boda" }));

    expect(onChange).toHaveBeenLastCalledWith(["w1", "w2"]);
  });

  it("removes a wishlist's id when its chip's remove button is clicked", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: /Cumpleaños/ }));

    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("resolves an i18n-key error message to Spanish (T092)", () => {
    function ErrorHarness() {
      const { control } = useHarnessForm([]);
      return (
        <WishlistMultiSelect
          control={control}
          wishlists={wishlists}
          error="wishlist.itemForm.errors.wishlistIds"
        />
      );
    }
    render(<ErrorHarness />);

    expect(screen.getByRole("alert")).toHaveTextContent("Elige al menos una lista");
  });

  it("disables the search input when disabled (T082)", () => {
    function DisabledHarness() {
      const { control } = useHarnessForm(["w1"]);
      return <WishlistMultiSelect control={control} wishlists={wishlists} disabled />;
    }
    render(<DisabledHarness />);

    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
