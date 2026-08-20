// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const navigateMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

import { useSearchNavigation } from "@/features/search/useSearchNavigation";

describe("useSearchNavigation", () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it("navigates to search with new query on handleSearch", () => {
    const { result } = renderHook(() => useSearchNavigation("initial", "movie"));
    result.current.handleSearch("star wars");
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/search",
      search: { query: "star wars", type: "movie" },
    });
  });

  it("navigates to search with new type on handleTabChange", () => {
    const { result } = renderHook(() => useSearchNavigation("initial", "movie"));
    result.current.handleTabChange("tv");
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/search",
      search: { query: "initial", type: "tv" },
    });
  });
});
