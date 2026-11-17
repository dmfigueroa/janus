import { describe, expect, it } from "vitest";
import { findGlobalClassAssignments } from "./check-v2-module-boundaries.mjs";

describe("V2 module boundaries", () => {
  it("rejects the global helper class pattern from watchlist reordering", () => {
    expect(
      findGlobalClassAssignments("window.WatchlistReorderGroups = class { initialize() {} };"),
    ).toBe(true);
  });

  it("allows a named ES module class export", () => {
    expect(findGlobalClassAssignments("export class WatchlistReorderGroups {}")).toBe(false);
  });
});
