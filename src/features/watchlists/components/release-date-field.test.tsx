// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReleaseDateField } from "./release-date-field";

describe("ReleaseDateField", () => {
  afterEach(() => {
    cleanup();
  });

  it("displays and preserves a year-only release date", () => {
    const { container } = render(
      <ReleaseDateField inputId="release-date" inputName="releaseDate" initialReleaseDate="2025" />,
    );

    expect(screen.getByRole("button", { name: /2025/i })).not.toBeNull();
    expect(container.querySelector('input[name="releaseDate"]')).toHaveProperty("value", "2025");
  });

  it("allows direct navigation back to the invention of the printing press", () => {
    render(
      <ReleaseDateField inputId="release-date" inputName="releaseDate" initialReleaseDate="" />,
    );

    fireEvent.click(screen.getByRole("button", { name: /select date/i }));

    const yearDropdown = screen.getByRole("combobox", { name: /year/i });
    expect(yearDropdown.querySelector('option[value="1440"]')).not.toBeNull();
    expect(yearDropdown.querySelector('option[value="1439"]')).toBeNull();
  });
});
