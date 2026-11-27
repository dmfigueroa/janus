// @vitest-environment jsdom

import { QueryClient, dehydrate, hydrate } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaSearchOutcome } from "@/features/search/search/MediaSearch";

const searchUnifiedMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/search/search/MediaSearch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/search/search/MediaSearch")>();
  return {
    ...actual,
    searchUnified: searchUnifiedMock,
  };
});

vi.mock("@/features/search/SearchDiscoveryScreen", () => ({
  SearchDiscoveryScreen: () => null,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => config,
}));

import { Route } from "@/routes/search";
import { searchMediaInfiniteQueryOptions } from "@/features/search/useSearchResults";
import { DEPRECATED_MEDIA_MESSAGE } from "@/server/Media";

const routeConfig = Route as unknown as {
  validateSearch: (input: Record<string, unknown>) => { query: string; type: string };
  loaderDeps: (input: { search: { query: string; type: string } }) => {
    query: string;
    type: string;
  };
  loader: (input: {
    context: { queryClient: QueryClient };
    deps: { query: string; type: string };
  }) => Promise<void>;
};

describe("search route", () => {
  beforeEach(() => {
    searchUnifiedMock.mockReset();
  });

  it("validates search params without page and recovers invalid types to movie", () => {
    expect(routeConfig.validateSearch({})).toEqual({ query: "", type: "movie" });
    expect(routeConfig.validateSearch({ query: "dune", type: "invalid", page: 3 })).toEqual({
      query: "dune",
      type: "movie",
    });
    expect(routeConfig.validateSearch({ query: 1984, type: "book" })).toEqual({
      query: "1984",
      type: "book",
    });
    expect(routeConfig.validateSearch({ query: { bad: true }, type: "tv" })).toEqual({
      query: "",
      type: "tv",
    });
  });

  it("normalizes whitespace in loaderDeps so padded queries share one cache entry", () => {
    expect(routeConfig.loaderDeps({ search: { query: "  dune  ", type: "book" } })).toEqual({
      query: "dune",
      type: "book",
    });
  });

  it("primes the query cache with the authoritative deprecated message on initial load", async () => {
    const queryClient = new QueryClient();
    const outcome: MediaSearchOutcome = {
      status: "deprecated_media_type",
      page: 1,
      message: DEPRECATED_MEDIA_MESSAGE,
    };
    searchUnifiedMock.mockResolvedValue(outcome);

    await routeConfig.loader({
      context: { queryClient },
      deps: { query: "test", type: "anime" },
    });

    expect(searchUnifiedMock).toHaveBeenCalledTimes(1);
    expect(searchUnifiedMock).toHaveBeenCalledWith({
      data: { query: "test", page: 1, type: "anime" },
    });
    expect(
      queryClient.getQueryData(
        searchMediaInfiniteQueryOptions({ query: "test", type: "anime" }).queryKey,
      ),
    ).toEqual({
      pages: [outcome],
      pageParams: [1],
    });
  });

  it("delegates empty queries to the shared search boundary and primes the cache", async () => {
    const queryClient = new QueryClient();
    const outcome: MediaSearchOutcome = {
      status: "empty_query",
      page: 1,
      message: "Enter a search term to find media.",
    };
    searchUnifiedMock.mockResolvedValue(outcome);

    await routeConfig.loader({
      context: { queryClient },
      deps: { query: "", type: "movie" },
    });

    expect(searchUnifiedMock).toHaveBeenCalledWith({
      data: { query: "", page: 1, type: "movie" },
    });
    expect(
      queryClient.getQueryData(
        searchMediaInfiniteQueryOptions({ query: "", type: "movie" }).queryKey,
      ),
    ).toEqual({
      pages: [outcome],
      pageParams: [1],
    });
  });

  it("dehydrates page 1 fresh so a hydrated client avoids refetching a successful search", async () => {
    const serverClient = new QueryClient();
    const outcome: MediaSearchOutcome = {
      status: "ok",
      results: [
        { id: "1", title: "Dune", mediaType: "book", source: "google_books", poster: null },
      ],
      page: 1,
      totalPages: 2,
      totalResults: 2,
    };
    searchUnifiedMock.mockResolvedValue(outcome);

    await routeConfig.loader({
      context: { queryClient: serverClient },
      deps: { query: "  Dune  ", type: "book" },
    });

    const clientQueryClient = new QueryClient();
    hydrate(clientQueryClient, dehydrate(serverClient));

    await routeConfig.loader({
      context: { queryClient: clientQueryClient },
      deps: { query: "Dune", type: "book" },
    });

    expect(searchUnifiedMock).toHaveBeenCalledTimes(1);
  });

  it("revalidates provider_unavailable outcomes instead of treating them as fresh", async () => {
    const queryClient = new QueryClient();
    const unavailableOutcome: MediaSearchOutcome = {
      status: "provider_unavailable",
      page: 1,
      message: "Search is temporarily unavailable for this media type. Please try again later.",
    };
    const recoveredOutcome: MediaSearchOutcome = {
      status: "ok",
      results: [
        { id: "1", title: "Dune", mediaType: "book", source: "google_books", poster: null },
      ],
      page: 1,
      totalPages: 1,
      totalResults: 1,
    };
    searchUnifiedMock
      .mockResolvedValueOnce(unavailableOutcome)
      .mockResolvedValueOnce(recoveredOutcome);

    await routeConfig.loader({
      context: { queryClient },
      deps: { query: "Dune", type: "book" },
    });
    await routeConfig.loader({
      context: { queryClient },
      deps: { query: "Dune", type: "book" },
    });

    expect(searchUnifiedMock).toHaveBeenCalledTimes(2);
  });
});
