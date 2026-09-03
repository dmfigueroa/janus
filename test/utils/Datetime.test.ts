import { describe, expect, it } from "vitest";
import { formatReleaseDate } from "@/utils/Datetime";

describe("formatReleaseDate", () => {
  it.each([
    ["2024-01-01", false, "January 1"],
    ["2024-01-01", true, "January 1, 2024"],
    ["2024-01", false, "January"],
    ["2024-01", true, "January 2024"],
    ["2024", false, "2024"],
    ["2024", true, "2024"],
  ])("formats %s with year=%s as %s", (date, includeYear, expected) => {
    expect(formatReleaseDate(date, includeYear)).toBe(expected);
  });

  it.each(["", "2024-1", "2024-13", "2024-02-30", "2024-01-01T00:00:00", "20245"])(
    "returns TBA for invalid date %s",
    (date) => {
      expect(formatReleaseDate(date)).toBe("TBA");
    },
  );

  it.each([null, undefined])("returns TBA for missing date %s", (date) => {
    expect(formatReleaseDate(date)).toBe("TBA");
  });
});
