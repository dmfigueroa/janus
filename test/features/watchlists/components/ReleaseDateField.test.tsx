// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Provider } from "@/app/Provider";
import { ReleaseDateField } from "@/features/watchlists/components/ReleaseDateField";

describe("ReleaseDateField", () => {
  afterEach(() => {
    vi.useRealTimers();
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

  it("uses the date picker control to anchor the calendar and position its trigger", () => {
    renderWithProvider(
      <ReleaseDateField inputId="release-date" inputName="releaseDate" initialReleaseDate="" />,
    );

    const datePickerControl = document.querySelector(
      '[data-scope="date-picker"][data-part="control"]',
    );

    expect(datePickerControl).not.toBeNull();
    expect(screen.getByRole("button", { name: /open date picker/i }).parentElement).toBe(
      datePickerControl,
    );
  });

  it("uses a compact, centered calendar trigger", () => {
    renderWithProvider(
      <ReleaseDateField inputId="release-date" inputName="releaseDate" initialReleaseDate="" />,
    );

    const calendarTrigger = screen.getByRole("button", { name: /open date picker/i });
    const calendarIcon = calendarTrigger.querySelector("svg");

    expect(calendarIcon?.getAttribute("width")).toBe("16");
    expect(calendarIcon?.getAttribute("height")).toBe("16");
    expect(getComputedStyle(calendarTrigger).top).toBe("50%");
    expect(getComputedStyle(calendarTrigger).transform).toBe("translateY(-50%)");
    expect(getComputedStyle(calendarTrigger).borderRadius).toBe("var(--chakra-radii-full)");
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

  it("computes the maximum selectable year from the current clock instead of module load time", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2031, 5, 15, 12, 0, 0));

    renderWithProvider(
      <ReleaseDateField inputId="release-date" inputName="releaseDate" initialReleaseDate="" />,
    );

    fireEvent.click(screen.getByRole("button", { name: /open date picker/i }));

    const yearDropdown = await screen.findByRole("combobox", { name: /year/i });
    expect(yearDropdown.querySelector('option[value="2041"]')).not.toBeNull();
    expect(yearDropdown.querySelector('option[value="2042"]')).toBeNull();
  });
});

function renderWithProvider(component: React.ReactNode) {
  return render(<Provider>{component}</Provider>);
}
