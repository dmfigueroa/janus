// @vitest-environment jsdom

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const searchUnifiedFnMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => searchUnifiedFnMock,
  createServerFn: () => ({
    inputValidator: () => ({ handler: () => vi.fn() }),
    handler: () => vi.fn(),
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: () => ({
    data: mockInfiniteData,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
}));

vi.mock("@/components/SearchInput", () => ({
  SearchInput: () => <input data-testid="search-input" />,
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

import { SearchScreen } from "./screen";

let mockInfiniteData:
  | {
      pages: Array<{
        results: unknown[];
        page: number;
        total_pages: number;
        total_results: number;
        rejected?: boolean;
        message?: string;
      }>;
    }
  | undefined = undefined;

describe("SearchScreen behavior", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockInfiniteData = undefined;
    searchUnifiedFnMock.mockReset();
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
    mockInfiniteData = {
      pages: [{ results: [], page: 1, total_pages: 0, total_results: 0 }],
    };
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
    mockInfiniteData = {
      pages: [
        {
          results: [{ id: "1", title: "Harry Potter" }],
          page: 1,
          total_pages: 1,
          total_results: 1,
        },
      ],
    };
    render(
      <SearchScreen
        query="harry potter"
        type="book"
        initialData={{
          results: [
            {
              id: "1",
              title: "Harry Potter",
              mediaType: "book",
              source: "google_books",
              poster: null,
            },
          ],
          page: 1,
          total_pages: 1,
          total_results: 1,
        }}
      />,
    );
    expect(screen.getByTestId("has-results")).not.toBeNull();
    expect(screen.getByText("1 result(s)")).not.toBeNull();
  });

  it("shows deprecated warning for anime/manga types", () => {
    mockInfiniteData = {
      pages: [
        {
          results: [],
          page: 1,
          total_pages: 1,
          total_results: 0,
          rejected: true,
          message:
            "Anime and manga categories are deprecated while we revisit provider data quality.",
        },
      ],
    };
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
