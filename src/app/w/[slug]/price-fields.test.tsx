import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";

import { createItemSchema, type CreateItemInput } from "@/lib/schemas/item";

import { PriceFields } from "./price-fields";

const A_LIST_ID = "11111111-1111-4111-8111-111111111111";

function Harness({ currency, disabled }: { currency?: "COP" | "USD"; disabled?: boolean }) {
  const { control, trigger, formState } = useForm<CreateItemInput>({
    defaultValues: { url: "", title: "", wishlistIds: [], priceCurrency: currency },
  });
  return (
    <PriceFields control={control} errors={formState.errors} trigger={trigger} disabled={disabled} />
  );
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
      const { control, watch, trigger, formState } = useForm<CreateItemInput>({
        defaultValues: { url: "", title: "", wishlistIds: [], priceCurrency: "USD" },
      });
      return (
        <>
          <PriceFields control={control} errors={formState.errors} trigger={trigger} />
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
      const { control, formState, trigger, setValue } = useForm<CreateItemInput>({
        defaultValues: { url: "", title: "", wishlistIds: [], priceCurrency: "USD" },
      });
      return (
        <>
          <PriceFields control={control} errors={formState.errors} trigger={trigger} />
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

  it("disables both the amount and currency fields when disabled (T082)", () => {
    render(<Harness currency="USD" disabled />);

    expect(screen.getByLabelText("Precio")).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Moneda" })).toBeDisabled();
  });
});

describe("PriceFields — price/currency pairing (T092)", () => {
  function PairHarness() {
    const { control, trigger, setValue, formState } = useForm<CreateItemInput>({
      resolver: zodResolver(createItemSchema),
      mode: "onTouched",
      defaultValues: {
        url: "https://example.com/x",
        title: "Bicicleta",
        wishlistIds: [A_LIST_ID],
      },
    });
    return (
      <>
        <PriceFields control={control} errors={formState.errors} trigger={trigger} />
        <button type="button" onClick={() => setValue("priceCurrency", "USD")}>
          pick-usd
        </button>
        <output>{String(formState.isValid)}</output>
      </>
    );
  }

  it("flags the pair error in Spanish once a price is typed with no currency, then clears it when the currency is picked", async () => {
    render(<PairHarness />);

    await userEvent.type(screen.getByLabelText("Precio"), "1000");
    expect(await screen.findByText("El precio y la moneda van juntos")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("false"));

    await userEvent.click(screen.getByRole("button", { name: "pick-usd" }));

    await waitFor(() =>
      expect(screen.queryByText("El precio y la moneda van juntos")).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("true"));
  });
});
