import { afterEach, describe, expect, it, vi } from "vitest";
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

  describe("leap days and century boundaries", () => {
    it("accepts leap days that exist", () => {
      expect(formatReleaseDate("2024-02-29", true)).toBe("February 29, 2024");
      expect(formatReleaseDate("2000-02-29", true)).toBe("February 29, 2000");
      expect(formatReleaseDate("0400-02-29", true)).toBe("February 29, 0400");
      expect(formatReleaseDate("0004-02-29", true)).toBe("February 29, 0004");
    });

    it("rejects leap days that do not exist instead of rolling into another month", () => {
      expect(formatReleaseDate("2023-02-29")).toBe("TBA");
      expect(formatReleaseDate("1900-02-29")).toBe("TBA");
      expect(formatReleaseDate("0100-02-29")).toBe("TBA");
    });

    it("rejects out-of-range months and days", () => {
      expect(formatReleaseDate("2024-00-10")).toBe("TBA");
      expect(formatReleaseDate("2024-13-01")).toBe("TBA");
      expect(formatReleaseDate("2024-01-00")).toBe("TBA");
      expect(formatReleaseDate("2024-01-32")).toBe("TBA");
      expect(formatReleaseDate("2024-04-31")).toBe("TBA");
    });

    it("formats years below 100 without century offsets", () => {
      expect(formatReleaseDate("0099-12-31", true)).toBe("December 31, 0099");
      expect(formatReleaseDate("0001-01-01", true)).toBe("January 1, 0001");
      expect(formatReleaseDate("0099")).toBe("0099");
    });

    it("preserves the legacy year-zero rendering", () => {
      expect(formatReleaseDate("0000-01-01", true)).toBe("January 1, 0001");
      expect(formatReleaseDate("0000-02-29", true)).toBe("February 29, 0001");
    });
  });

  describe("partial dates", () => {
    it("rejects impossible months in month-only dates", () => {
      expect(formatReleaseDate("2024-00")).toBe("TBA");
      expect(formatReleaseDate("2024-13")).toBe("TBA");
    });
  });

  describe("timezone boundaries", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it.each(["Pacific/Kiritimati", "Pacific/Midway", "UTC"])(
      "formats calendar dates independently of the %s timezone",
      (timeZone) => {
        vi.stubEnv("TZ", timeZone);

        expect(formatReleaseDate("2024-01-01", true)).toBe("January 1, 2024");
        expect(formatReleaseDate("2024-12-31", true)).toBe("December 31, 2024");
        expect(formatReleaseDate("2024-03", true)).toBe("March 2024");
        expect(formatReleaseDate("0099-12-31", true)).toBe("December 31, 0099");
        expect(formatReleaseDate("2023-02-29")).toBe("TBA");
      },
    );
  });
});
