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
    dataUpdatedAt: 0,
    isLoading: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  })),
}));

vi.mock("@/features/search/useSearchNavigation", () => ({
  useSearchNavigation: vi.fn(() => ({
    handleSearch: vi.fn(),
    handleTabChange: vi.fn(),
    isNavigating: false,
  })),
}));

vi.mock("@/features/search/SearchInput", () => ({
  SearchInput: ({ defaultValue, isLoading }: { defaultValue: string; isLoading?: boolean }) => (
    <input
      data-testid="search-input"
      data-loading={String(Boolean(isLoading))}
      defaultValue={defaultValue}
    />
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

function mockSearchResults(
  outcome: MediaSearchOutcome,
  allResults: unknown[] = [],
  options: { isLoading?: boolean; dataUpdatedAt?: number } = {},
) {
  vi.mocked(useSearchResults).mockReturnValue({
    allResults: allResults as never,
    status: outcome.status,
    message: outcome.message,
    dataUpdatedAt: options.dataUpdatedAt ?? 0,
    isLoading: options.isLoading ?? false,
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
      isNavigating: false,
    });
  });

  it("renders search input and tabs", () => {
    const { container } = render(<SearchDiscoveryScreen query="" type="movie" />);
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
    render(<SearchDiscoveryScreen query="" type="movie" />);
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

    render(<SearchDiscoveryScreen query="harry potter" type="book" />);
    expect(screen.getByTestId("has-results")).not.toBeNull();
    expect(screen.getByText("1 result(s)")).not.toBeNull();
  });

  it("shows a single deprecated search banner on deprecated media routes", () => {
    mockSearchResults(deprecatedOutcome);

    render(<SearchDiscoveryScreen query="naruto" type="anime" />);
    const deprecatedMessages = screen.getAllByText(/Anime and manga categories are deprecated/);
    expect(deprecatedMessages).toHaveLength(1);
    expect(
      screen.getByText(/Please switch to Movies, TV, Games, Books, or Comics\./),
    ).not.toBeNull();
    expect(toasterCreateMock).not.toHaveBeenCalled();
  });

  it("wires live loading state from search results and navigation into SearchInput", () => {
    mockSearchResults(emptyOutcome, [], { isLoading: true });

    const { rerender } = render(<SearchDiscoveryScreen query="dune" type="book" />);
    expect(screen.getByTestId("search-input").getAttribute("data-loading")).toBe("true");

    mockSearchResults(emptyOutcome, [], { isLoading: false });
    vi.mocked(useSearchNavigation).mockReturnValue({
      handleSearch: vi.fn(),
      handleTabChange: vi.fn(),
      isNavigating: true,
    });
    rerender(<SearchDiscoveryScreen query="dune" type="book" />);
    expect(screen.getByTestId("search-input").getAttribute("data-loading")).toBe("true");
  });

  it("toasts the provider-unavailable message on each distinct failed search attempt", () => {
    const providerUnavailableOutcome: MediaSearchOutcome = {
      status: "provider_unavailable",
      page: 1,
      message: "Search is temporarily unavailable for this media type. Please try again later.",
    };
    mockSearchResults(providerUnavailableOutcome, [], { dataUpdatedAt: 1 });

    const { rerender } = render(<SearchDiscoveryScreen query="Dune" type="book" />);

    expect(toasterCreateMock).toHaveBeenCalledTimes(1);
    expect(toasterCreateMock).toHaveBeenCalledWith({
      id: "media-search-provider-unavailable",
      type: "error",
      title: "Search is temporarily unavailable for this media type. Please try again later.",
    });

    const repeatOutcome: MediaSearchOutcome = { ...providerUnavailableOutcome };
    mockSearchResults(repeatOutcome, [], { dataUpdatedAt: 2 });
    rerender(<SearchDiscoveryScreen query="Foundation" type="book" />);

    expect(toasterCreateMock).toHaveBeenCalledTimes(2);
  });
});
