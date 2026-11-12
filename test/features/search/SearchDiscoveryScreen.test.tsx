// @vitest-environment jsdom

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "../../utils/Render";
import type { MediaSearchOutcome } from "@/features/search/search/MediaSearch";

const { toasterCreateMock } = vi.hoisted(() => ({ toasterCreateMock: vi.fn() }));

vi.mock("@/app/Toaster", () => ({ toaster: { create: toasterCreateMock } }));

vi.mock("@/features/search/useSearchResults", () => ({
  useSearchResults: vi.fn(() => ({
    allResults: [],
    status: "empty_query",
    message: "Enter a search term to find media.",
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
}));

import { SearchDiscoveryScreen } from "@/features/search/SearchDiscoveryScreen";
import { useSearchResults } from "@/features/search/useSearchResults";
import { useSearchNavigation } from "@/features/search/useSearchNavigation";

const emptyOutcome: MediaSearchOutcome = {
  status: "empty_query",
  page: 1,
  message: "Enter a search term to find media.",
};

const deprecatedOutcome: MediaSearchOutcome = {
  status: "deprecated_media_type",
  page: 1,
  message: "Anime and manga categories are deprecated while we revisit provider data quality.",
};

function mockSearchResults(outcome: MediaSearchOutcome, allResults: unknown[] = []) {
  vi.mocked(useSearchResults).mockReturnValue({
    allResults: allResults as never,
    status: outcome.status,
    message: outcome.message,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  });
}

describe("SearchDiscoveryScreen behavior", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    toasterCreateMock.mockReset();
    mockSearchResults(emptyOutcome);
    vi.mocked(useSearchNavigation).mockReturnValue({
      handleSearch: vi.fn(),
      handleTabChange: vi.fn(),
    });
  });

  it("renders search input and tabs", () => {
    const { container } = render(
      <SearchDiscoveryScreen query="" type="movie" initialData={emptyOutcome} />,
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

  it("shows 'No results found' when the search is empty", () => {
    render(<SearchDiscoveryScreen query="" type="movie" initialData={emptyOutcome} />);
    expect(screen.getByTestId("no-results")).not.toBeNull();
  });

  it("renders results when the search returns items", () => {
    mockSearchResults(
      {
        status: "ok",
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
        totalPages: 1,
        totalResults: 1,
      },
      [
        {
          id: "1",
          title: "Harry Potter",
          mediaType: "book",
          source: "google_books",
          poster: null,
        },
      ],
    );

    render(
      <SearchDiscoveryScreen
        query="harry potter"
        type="book"
        initialData={{
          status: "ok",
          results: [],
          page: 1,
          totalPages: 1,
          totalResults: 1,
        }}
      />,
    );
    expect(screen.getByTestId("has-results")).not.toBeNull();
    expect(screen.getByText("1 result(s)")).not.toBeNull();
  });

  it("shows the deprecated search message returned by the search boundary", () => {
    mockSearchResults(deprecatedOutcome);

    render(<SearchDiscoveryScreen query="naruto" type="anime" initialData={deprecatedOutcome} />);
    const deprecatedMessages = screen.getAllByText(/Anime and manga categories are deprecated/);
    expect(deprecatedMessages.length).toBeGreaterThanOrEqual(2);
    expect(toasterCreateMock).not.toHaveBeenCalled();
  });

  it("toasts the provider-unavailable message returned by the search boundary", () => {
    const providerUnavailableOutcome: MediaSearchOutcome = {
      status: "provider_unavailable",
      page: 1,
      message: "Search is temporarily unavailable for this media type. Please try again later.",
    };
    mockSearchResults(providerUnavailableOutcome);

    render(
      <SearchDiscoveryScreen query="Dune" type="book" initialData={providerUnavailableOutcome} />,
    );

    expect(toasterCreateMock).toHaveBeenCalledWith({
      id: "media-search-provider-unavailable",
      type: "error",
      title: "Search is temporarily unavailable for this media type. Please try again later.",
    });
  });
});
