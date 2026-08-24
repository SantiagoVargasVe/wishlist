import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("renders its children", () => {
    render(<Button>Guardar</Button>);
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("applies each variant's classes", () => {
    const { rerender } = render(<Button variant="primary">X</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-primary");

    rerender(<Button variant="secondary">X</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-secondary");

    rerender(<Button variant="ghost">X</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-transparent");

    rerender(<Button variant="destructive">X</Button>);
    expect(screen.getByRole("button")).toHaveClass("bg-destructive");
  });

  it("defaults to the primary variant and md size", () => {
    render(<Button>X</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("bg-primary");
    expect(button).toHaveClass("h-10");
  });

  it("forwards a caller className without dropping the base classes", () => {
    render(<Button className="mt-4">X</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("mt-4");
    expect(button).toHaveClass("bg-primary"); // still the default variant
  });

  it("lets a caller className win a real Tailwind conflict, via cn()", () => {
    // The whole point of running className through cn(): a caller overriding
    // a specific utility should win, not lose to source-order specificity.
    // Checked as exact tokens, not substrings — "hover:bg-primary/90" isn't
    // the same utility as "bg-primary" and correctly survives the merge
    // untouched, since the caller only overrode the base (unprefixed) color.
    render(
      <Button variant="primary" className="bg-destructive">
        X
      </Button>,
    );
    const classes = screen.getByRole("button").className.split(" ");
    expect(classes).toContain("bg-destructive");
    expect(classes).not.toContain("bg-primary");
  });

  it("forwards standard button props, including disabled", () => {
    render(<Button disabled>X</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("forwards a ref to the underlying DOM button", () => {
    let ref: HTMLButtonElement | null = null;
    render(
      <Button
        ref={(el) => {
          ref = el;
        }}
      >
        X
      </Button>,
    );
    expect(ref).toBeInstanceOf(HTMLButtonElement);
  });
});
