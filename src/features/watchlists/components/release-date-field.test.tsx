// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReleaseDateField } from "./release-date-field";

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

  it("accepts a release date from the keyboard", () => {
    render(
      <ReleaseDateField inputId="release-date" inputName="releaseDate" initialReleaseDate="" />,
    );

    const dateInput = screen.getByRole("textbox");
    fireEvent.change(dateInput, { target: { value: "1950-10-16" } });

    expect(dateInput).toHaveProperty("value", "1950-10-16");
    expect(dateInput).toHaveProperty("name", "releaseDate");
  });

  it("allows direct navigation back to the invention of the printing press", () => {
    render(
      <ReleaseDateField inputId="release-date" inputName="releaseDate" initialReleaseDate="" />,
    );

    fireEvent.click(screen.getByRole("button", { name: /open date picker/i }));

    const yearDropdown = screen.getByRole("combobox", { name: /year/i });
    expect(yearDropdown.querySelector('option[value="1440"]')).not.toBeNull();
    expect(yearDropdown.querySelector('option[value="1439"]')).toBeNull();
    expect(screen.getByRole("dialog").classList.contains("overflow-y-auto")).toBe(true);
  });
});
