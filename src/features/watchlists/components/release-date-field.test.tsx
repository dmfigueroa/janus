// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
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
});
