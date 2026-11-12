// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaSearchOutcome } from "@/features/search/search/MediaSearch";

const searchUnifiedMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/search/search/MediaSearch", () => ({
  searchableMediaTypes: ["movie", "tv", "game", "book", "comic", "anime", "manga"],
  searchableMediaLabels: {
    movie: "Movies",
    tv: "TV",
    game: "Games",
    book: "Books",
    comic: "Comics",
    anime: "Anime",
    manga: "Manga",
  },
  searchUnified: searchUnifiedMock,
}));

vi.mock("@/features/search/SearchDiscoveryScreen", () => ({
  SearchDiscoveryScreen: () => null,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => config,
  useSearch: () => ({}),
}));

import { Route } from "@/routes/search";
import { DEPRECATED_MEDIA_MESSAGE } from "@/server/Media";

const loader = (
  Route as unknown as {
    loader: (input: { deps: { query: string; type: string } }) => Promise<MediaSearchOutcome>;
  }
).loader;

describe("search route loader", () => {
  beforeEach(() => {
    searchUnifiedMock.mockReset();
  });

  it("preserves the authoritative deprecated message on initial load", async () => {
    const outcome: MediaSearchOutcome = {
      status: "deprecated_media_type",
      page: 1,
      message: DEPRECATED_MEDIA_MESSAGE,
    };
    searchUnifiedMock.mockResolvedValue(outcome);

    await expect(loader({ deps: { query: "test", type: "anime" } })).resolves.toEqual(outcome);
    expect(searchUnifiedMock).toHaveBeenCalledWith({
      data: { query: "test", page: 1, type: "anime" },
    });
  });

  it("delegates empty queries to the shared search boundary", async () => {
    const outcome: MediaSearchOutcome = {
      status: "empty_query",
      page: 1,
      message: "Enter a search term to find media.",
    };
    searchUnifiedMock.mockResolvedValue(outcome);

    await expect(loader({ deps: { query: "", type: "movie" } })).resolves.toEqual(outcome);
    expect(searchUnifiedMock).toHaveBeenCalledWith({
      data: { query: "", page: 1, type: "movie" },
    });
  });
});
