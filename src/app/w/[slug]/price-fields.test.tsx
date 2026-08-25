import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";

import type { CreateItemInput } from "@/lib/schemas/item";

import { PriceFields } from "./price-fields";

function Harness({ currency }: { currency?: "COP" | "USD" }) {
  const { control, formState } = useForm<CreateItemInput>({
    defaultValues: { url: "", title: "", wishlistIds: [], priceCurrency: currency },
  });
  return <PriceFields control={control} errors={formState.errors} />;
}

describe("PriceFields — price input masking (T083)", () => {
  it("displays thousands separators as the user types, matching USD's convention", async () => {
    render(<Harness currency="USD" />);
    const price = screen.getByLabelText("Precio");

    await userEvent.type(price, "1300000");

    expect(price).toHaveValue("1,300,000");
  });

  it("displays thousands separators matching COP's convention", async () => {
    render(<Harness currency="COP" />);
    const price = screen.getByLabelText("Precio");

    await userEvent.type(price, "1300000");

    expect(price).toHaveValue("1.300.000");
  });

  it("registers the raw digit string with react-hook-form, not the formatted display value", async () => {
    function ValueHarness() {
      const { control, watch, formState } = useForm<CreateItemInput>({
        defaultValues: { url: "", title: "", wishlistIds: [], priceCurrency: "USD" },
      });
      return (
        <>
          <PriceFields control={control} errors={formState.errors} />
          <output>{watch("priceAmount")}</output>
        </>
      );
    }
    render(<ValueHarness />);

    await userEvent.type(screen.getByLabelText("Precio"), "1300000");

    expect(screen.getByRole("status")).toHaveTextContent("1300000");
  });

  it("reformats an already-entered amount when the currency changes", async () => {
    function SwitchHarness() {
      const { control, formState, setValue } = useForm<CreateItemInput>({
        defaultValues: { url: "", title: "", wishlistIds: [], priceCurrency: "USD" },
      });
      return (
        <>
          <PriceFields control={control} errors={formState.errors} />
          <button type="button" onClick={() => setValue("priceCurrency", "COP")}>
            switch
          </button>
        </>
      );
    }
    render(<SwitchHarness />);

    await userEvent.type(screen.getByLabelText("Precio"), "1300000");
    expect(screen.getByLabelText("Precio")).toHaveValue("1,300,000");

    await userEvent.click(screen.getByRole("button", { name: "switch" }));

    expect(screen.getByLabelText("Precio")).toHaveValue("1.300.000");
  });

  it("preserves cents when typing a decimal amount", async () => {
    render(<Harness currency="USD" />);
    const price = screen.getByLabelText("Precio");

    await userEvent.type(price, "49.99");

    expect(price).toHaveValue("49.99");
  });
});
