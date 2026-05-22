// @vitest-environment jsdom

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("./useSearchResults", () => ({
  useSearchResults: vi.fn(() => ({
    allResults: [],
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  })),
}));

vi.mock("./useSearchNavigation", () => ({
  useSearchNavigation: vi.fn(() => ({
    handleSearch: vi.fn(),
    handleTabChange: vi.fn(),
  })),
}));

vi.mock("@/components/SearchInput", () => ({
  SearchInput: ({ defaultValue }: { defaultValue: string }) => (
    <input data-testid="search-input" defaultValue={defaultValue} />
  ),
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children, value }: { children: ReactNode; value: string }) => (
    <div data-testid="tabs" data-value={value}>
      {children}
    </div>
  ),
  TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ value, children }: { value: string; children: ReactNode }) => (
    <button data-testid={`tab-${value}`}>{children}</button>
  ),
}));

vi.mock("@/features/search/SearchResults", () => ({
  SearchResults: ({ results }: { results: unknown[] }) => (
    <div data-testid="search-results">
      {results.length === 0 ? (
        <div data-testid="no-results">No results found</div>
      ) : (
        <div data-testid="has-results">{results.length} result(s)</div>
      )}
    </div>
  ),
}));

vi.mock("@/server/media", () => ({
  DEPRECATED_MEDIA_MESSAGE:
    "Anime and manga categories are deprecated while we revisit provider data quality.",
  isDeprecatedMediaType: (type: string) => type === "anime" || type === "manga",
}));

import { SearchScreen } from "./screen";
import { useSearchResults } from "./useSearchResults";
import { useSearchNavigation } from "./useSearchNavigation";

describe("SearchScreen behavior", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.mocked(useSearchResults).mockReturnValue({
      allResults: [],
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    vi.mocked(useSearchNavigation).mockReturnValue({
      handleSearch: vi.fn(),
      handleTabChange: vi.fn(),
    });
  });

  it("renders search input and tabs", () => {
    render(
      <SearchScreen
        query=""
        type="movie"
        initialData={{ results: [], page: 1, total_pages: 0, total_results: 0 }}
      />,
    );
    expect(screen.getByTestId("search-input")).not.toBeNull();
    expect(screen.getByTestId("tabs")).not.toBeNull();
  });

  it("shows 'No results found' when query is empty", () => {
    render(
      <SearchScreen
        query=""
        type="movie"
        initialData={{ results: [], page: 1, total_pages: 0, total_results: 0 }}
      />,
    );
    expect(screen.getByTestId("no-results")).not.toBeNull();
  });

  it("renders results when query is present and data returns items", () => {
    vi.mocked(useSearchResults).mockReturnValue({
      allResults: [
        {
          id: "1",
          title: "Harry Potter",
          mediaType: "book",
          source: "google_books",
          poster: null,
        },
      ],
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });

    render(
      <SearchScreen
        query="harry potter"
        type="book"
        initialData={{ results: [], page: 1, total_pages: 1, total_results: 1 }}
      />,
    );
    expect(screen.getByTestId("has-results")).not.toBeNull();
    expect(screen.getByText("1 result(s)")).not.toBeNull();
  });

  it("shows deprecated warning for anime/manga types", () => {
    render(
      <SearchScreen
        query="naruto"
        type="anime"
        initialData={{ results: [], page: 1, total_pages: 1, total_results: 0, rejected: true }}
      />,
    );
    // The warning banner should appear in addition to the static header message
    const deprecatedMessages = screen.getAllByText(/Anime and manga categories are deprecated/);
    expect(deprecatedMessages.length).toBeGreaterThanOrEqual(2);
  });
});
