// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Provider } from "@/app/Provider";
import { ReleaseDateField } from "@/features/watchlists/components/ReleaseDateField";

describe("ReleaseDateField", () => {
  afterEach(() => {
    cleanup();
  });

  it("displays and preserves a year-only release date", () => {
    renderWithProvider(
      <ReleaseDateField inputId="release-date" inputName="releaseDate" initialReleaseDate="2025" />,
    );

    expect(screen.getByRole("textbox")).toHaveProperty("value", "2025");
  });

  it("accepts a localized release date from the keyboard and submits ISO", () => {
    renderWithProvider(
      <ReleaseDateField inputId="release-date" inputName="releaseDate" initialReleaseDate="" />,
    );

    const dateInput = screen.getByRole("textbox");
    fireEvent.change(dateInput, { target: { value: "10/16/1950" } });

    expect(dateInput).toHaveProperty("value", "10/16/1950");
    expect(document.querySelector('input[name="releaseDate"]')).toHaveProperty(
      "value",
      "1950-10-16",
    );
  });

  it("clears an existing release date from the calendar", async () => {
    renderWithProvider(
      <ReleaseDateField
        inputId="release-date"
        inputName="releaseDate"
        initialReleaseDate="1950-10-16"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /open date picker/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Clear date" }));

    expect(screen.getByRole("textbox")).toHaveProperty("value", "");
    expect(document.querySelector('input[name="releaseDate"]')).toHaveProperty("value", "");
  });

  it("allows direct navigation back to the invention of the printing press", async () => {
    renderWithProvider(
      <ReleaseDateField inputId="release-date" inputName="releaseDate" initialReleaseDate="" />,
    );

    fireEvent.click(screen.getByRole("button", { name: /open date picker/i }));

    const yearDropdown = await screen.findByRole("combobox", { name: /year/i });
    expect(yearDropdown.querySelector('option[value="1440"]')).not.toBeNull();
    expect(yearDropdown.querySelector('option[value="1439"]')).toBeNull();

    fireEvent.change(yearDropdown, { target: { value: "1950" } });
    expect(yearDropdown).toHaveProperty("value", "1950");

    await waitFor(() => {
      expect(
        document.querySelector('[data-part="table-cell"][data-value^="1950-"]'),
      ).not.toBeNull();
    });
    expect(screen.getByRole("application", { name: "calendar" }).hasAttribute("hidden")).toBe(
      false,
    );
  });
});

function renderWithProvider(component: React.ReactNode) {
  return render(<Provider>{component}</Provider>);
}
