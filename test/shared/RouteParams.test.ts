import { describe, expect, it } from "vitest";
import { parsePositiveIntegerParam } from "@/shared/RouteParams";

describe("parsePositiveIntegerParam", () => {
  it("parses strict positive safe integer strings", () => {
    expect(parsePositiveIntegerParam("1")).toBe(1);
    expect(parsePositiveIntegerParam("42")).toBe(42);
    expect(parsePositiveIntegerParam(String(Number.MAX_SAFE_INTEGER))).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it.each([
    "",
    "0",
    "-1",
    "abc",
    "12abc",
    "12.5",
    " 12 ",
    "+12",
    "1e2",
    "0x10",
    String(Number.MAX_SAFE_INTEGER + 1),
  ])("rejects invalid route id %j", (rawValue) => {
    expect(parsePositiveIntegerParam(rawValue)).toBeNull();
  });
});
