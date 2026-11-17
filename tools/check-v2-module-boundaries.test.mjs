import { describe, expect, it } from "vitest";
import { hasModuleSyntax, isReferencedAsModule } from "./check-v2-module-boundaries.mjs";

describe("V2 browser module boundaries", () => {
  it("rejects a first-party script loaded without module semantics", () => {
    expect(
      isReferencedAsModule(
        '<script defer src="{{ crate::assets::BROWSE_JS_URL }}"></script>',
        "browse.js",
      ),
    ).toBe(false);
  });

  it("accepts a first-party script loaded as a module", () => {
    expect(
      isReferencedAsModule(
        '<script type="module" src="{{ crate::assets::BROWSE_JS_URL }}"></script>',
        "browse.js",
      ),
    ).toBe(true);
  });

  it("recognizes imported helpers through their ES module syntax", () => {
    expect(hasModuleSyntax("export class WatchlistReorderGroups {};")).toBe(true);
  });

  it("rejects the former global class when loaded as a classic script", () => {
    const formerHelper = "window.WatchlistReorderGroups = class {};";
    expect(isReferencedAsModule('<script defer src="groups.js"></script>', "groups.js")).toBe(
      false,
    );
    expect(hasModuleSyntax(formerHelper)).toBe(false);
  });
});
