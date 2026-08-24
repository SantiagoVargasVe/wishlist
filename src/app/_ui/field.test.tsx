import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Field } from "./field";
import { Input } from "./input";

describe("Field", () => {
  it("renders the label, associated with its control", () => {
    render(
      <Field label="Correo">
        <Input />
      </Field>,
    );
    // Base UI's Field.Label auto-associates with the control inside Root —
    // getByLabelText only passes if that association actually works.
    expect(screen.getByLabelText("Correo")).toBeInTheDocument();
  });

  it("surfaces a validation error message", () => {
    render(
      <Field label="Correo" error="Ingresa un correo válido">
        <Input />
      </Field>,
    );
    expect(screen.getByText("Ingresa un correo válido")).toBeInTheDocument();
  });

  it("renders no error text when there is no error", () => {
    render(
      <Field label="Correo">
        <Input />
      </Field>,
    );
    // Field.Error only mounts when the field is invalid — asserting absence
    // by role/text rather than assuming an empty string rendered somewhere.
    expect(screen.queryByText(/válido/i)).not.toBeInTheDocument();
  });

  it("marks the field invalid only when an error is present", () => {
    const { rerender, container } = render(
      <Field label="Correo">
        <Input />
      </Field>,
    );
    expect(container.querySelector('[data-invalid]')).not.toBeInTheDocument();

    rerender(
      <Field label="Correo" error="Requerido">
        <Input />
      </Field>,
    );
    expect(container.querySelector("[data-invalid]")).toBeInTheDocument();
  });
});
