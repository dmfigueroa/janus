// @vitest-environment jsdom

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "../../utils/Render";

const { toasterCreateMock } = vi.hoisted(() => ({ toasterCreateMock: vi.fn() }));

vi.mock("@/app/Toaster", () => ({ toaster: { create: toasterCreateMock } }));

vi.mock("@/features/search/useSearchResults", () => ({
  useSearchResults: vi.fn(() => ({
    allResults: [],
    rejectionMessage: undefined,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  })),
}));

vi.mock("@/features/search/useSearchNavigation", () => ({
  useSearchNavigation: vi.fn(() => ({
    handleSearch: vi.fn(),
    handleTabChange: vi.fn(),
  })),
}));

vi.mock("@/features/search/SearchInput", () => ({
  SearchInput: ({ defaultValue }: { defaultValue: string }) => (
    <input data-testid="search-input" defaultValue={defaultValue} />
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

vi.mock("@/server/Media", () => ({
  DEPRECATED_MEDIA_MESSAGE:
    "Anime and manga categories are deprecated while we revisit provider data quality.",
  isDeprecatedMediaType: (type: string) => type === "anime" || type === "manga",
}));

import { SearchDiscoveryScreen } from "@/features/search/SearchDiscoveryScreen";
import { useSearchResults } from "@/features/search/useSearchResults";
import { useSearchNavigation } from "@/features/search/useSearchNavigation";

describe("SearchDiscoveryScreen behavior", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    toasterCreateMock.mockReset();
    vi.mocked(useSearchResults).mockReturnValue({
      allResults: [],
      rejectionMessage: undefined,
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
    const { container } = render(
      <SearchDiscoveryScreen
        query=""
        type="movie"
        initialData={{ results: [], page: 1, total_pages: 0, total_results: 0 }}
      />,
    );
    expect(screen.getByTestId("search-input")).not.toBeNull();
    expect(screen.getByRole("tablist")).not.toBeNull();
    expect(container.querySelector('[data-scope="tabs"][data-part="indicator"]')).toBeNull();
    const tabsRoot = container.querySelector<HTMLElement>('[data-scope="tabs"][data-part="root"]');
    expect(tabsRoot).not.toBeNull();
    expect(
      getComputedStyle(tabsRoot!).getPropertyValue("--chakra-colors-color-palette-solid"),
    ).toBe("var(--chakra-colors-pink-solid)");
  });

  it("shows 'No results found' when query is empty", () => {
    render(
      <SearchDiscoveryScreen
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
      rejectionMessage: undefined,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });

    render(
      <SearchDiscoveryScreen
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
      <SearchDiscoveryScreen
        query="naruto"
        type="anime"
        initialData={{ results: [], page: 1, total_pages: 1, total_results: 0, rejected: true }}
      />,
    );
    // The warning banner should appear in addition to the static header message
    const deprecatedMessages = screen.getAllByText(/Anime and manga categories are deprecated/);
    expect(deprecatedMessages.length).toBeGreaterThanOrEqual(2);
  });

  it("toasts the provider-unavailable message returned by the search boundary", () => {
    vi.mocked(useSearchResults).mockReturnValue({
      allResults: [],
      rejectionMessage:
        "Search is temporarily unavailable for this media type. Please try again later.",
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });

    render(
      <SearchDiscoveryScreen
        query="Dune"
        type="book"
        initialData={{ results: [], page: 1, total_pages: 1, total_results: 0, rejected: true }}
      />,
    );

    expect(toasterCreateMock).toHaveBeenCalledWith({
      id: "media-search-provider-unavailable",
      type: "error",
      title: "Search is temporarily unavailable for this media type. Please try again later.",
    });
  });
});
