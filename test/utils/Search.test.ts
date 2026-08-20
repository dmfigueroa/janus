import { describe, it, expect } from "vitest";
import { escapeLikeString } from "@/utils/Search";

describe("escapeLikeString", () => {
  it("should return the string as is if no special characters are present", () => {
    expect(escapeLikeString("hello world")).toBe("hello world");
  });

  it("should escape % characters", () => {
    expect(escapeLikeString("100%")).toBe("100\\%");
  });

  it("should escape _ characters", () => {
    expect(escapeLikeString("foo_bar")).toBe("foo\\_bar");
  });

  it("should escape \\ characters", () => {
    expect(escapeLikeString("C:\\Windows")).toBe("C:\\\\Windows");
  });

  it("should escape mixed special characters", () => {
    expect(escapeLikeString("100%_complete\\")).toBe("100\\%\\_complete\\\\");
  });
});
