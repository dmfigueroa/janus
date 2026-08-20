// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReleaseDateField } from "@/features/watchlists/components/ReleaseDateField";

describe("ReleaseDateField", () => {
  afterEach(() => {
    cleanup();
  });

  it("displays and preserves a year-only release date", () => {
    render(
      <ReleaseDateField inputId="release-date" inputName="releaseDate" initialReleaseDate="2025" />,
    );

    expect(screen.getByRole("textbox")).toHaveProperty("value", "2025");
  });

  it("accepts a localized release date from the keyboard and submits ISO", () => {
    render(
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

  it("allows direct navigation back to the invention of the printing press", () => {
    render(
      <ReleaseDateField inputId="release-date" inputName="releaseDate" initialReleaseDate="" />,
    );

    fireEvent.click(screen.getByRole("button", { name: /open date picker/i }));

    const yearDropdown = screen.getByRole("combobox", { name: /year/i });
    expect(yearDropdown.querySelector('option[value="1440"]')).not.toBeNull();
    expect(yearDropdown.querySelector('option[value="1439"]')).toBeNull();
    expect(yearDropdown.classList.contains("z-10")).toBe(true);

    fireEvent.change(yearDropdown, { target: { value: "1950" } });

    expect(screen.getByRole("grid", { name: /1950/i })).not.toBeNull();
    expect(screen.getByRole("dialog").classList.contains("overflow-y-auto")).toBe(true);
  });
});
