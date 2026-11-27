import { describe, expect, it } from "vitest";
import { checkTemplateCoverage } from "./check-v2-ui-map.mjs";

describe("V2 UI map template coverage", () => {
  it("rejects the unmapped search templates from PR #403 before the map section landed", () => {
    const pastMistakeTemplates = [
      "search.html",
      "search-screen.html",
      "search-results.html",
      "search-detail.html",
      "search-add-alert.html",
      "smoke.html",
      "watchlists.html",
    ];
    const mapWithoutSearch = `
| Home route | v1 | v2/templates/watchlists.html |
`;
    const violations = checkTemplateCoverage(pastMistakeTemplates, mapWithoutSearch);
    expect(violations.some((line) => line.includes("search-screen.html"))).toBe(true);
    expect(violations.some((line) => line.includes("search-results.html"))).toBe(true);
    expect(violations.some((line) => line.includes("smoke.html"))).toBe(false);
    expect(violations.some((line) => line.includes("watchlists.html"))).toBe(false);
  });

  it("passes when every non-harness template is listed in the map", () => {
    const templates = ["search.html", "smoke.html", "watchlists.html"];
    const map = `
v2/templates/search.html
v2/templates/watchlists.html
`;
    expect(checkTemplateCoverage(templates, map)).toEqual([]);
  });
});
