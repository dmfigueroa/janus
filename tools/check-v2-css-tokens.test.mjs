import { describe, expect, it } from "vitest";
import { checkCssSource } from "./check-v2-css-tokens.mjs";

describe("V2 CSS semantic token guardrails", () => {
  it("rejects the bare rem/ms search chrome values from PR #403 before the token refactor", () => {
    const pastMistake = `
.search-form button {
  min-height: 2.75rem;
  border-radius: 0.75rem;
  font-size: 0.875rem;
  transition: transform 120ms ease-out, background-color 150ms ease;
}
`;
    const violations = checkCssSource("v2/static/app.css", pastMistake);
    expect(violations.length).toBeGreaterThanOrEqual(4);
    expect(violations.join("\n")).toContain("--control-size-lg");
    expect(violations.join("\n")).toContain("--radius-control");
    expect(violations.join("\n")).toContain("--font-size-sm");
    expect(violations.join("\n")).toContain("--motion-duration-fast");
  });

  it("allows the same values when expressed through Janus semantic tokens", () => {
    const tokenized = `
.search-form button {
  min-height: var(--control-size-lg);
  border-radius: var(--radius-control);
  font-size: var(--font-size-sm);
  transition: transform var(--motion-duration-fast) ease-out;
}
`;
    expect(checkCssSource("v2/static/app.css", tokenized)).toEqual([]);
  });

  it("allows rem and ms inside :root custom property definitions", () => {
    const rootTokens = `
:root {
  --control-size-lg: calc(var(--size-7) + var(--size-2) + var(--size-1));
  --font-size-sm: 0.875rem;
  --motion-duration-fast: 120ms;
  --radius-control: calc(var(--size-2) + var(--size-1));
}
`;
    expect(checkCssSource("v2/static/app.css", rootTokens)).toEqual([]);
  });
});
