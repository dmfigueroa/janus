import { beforeEach, describe, expect, it, vi } from "vitest";

const providers = vi.hoisted(() => ({
  searchBooks: vi.fn(),
  searchComics: vi.fn(),
  searchGames: vi.fn(),
  searchMultimedia: vi.fn(),
}));

vi.mock("@/server/providers/Comicvine.server", () => ({ searchComics: providers.searchComics }));
vi.mock("@/server/providers/GoogleBooks.server", () => ({ searchBooks: providers.searchBooks }));
vi.mock("@/server/providers/Rawg.server", () => ({ searchGames: providers.searchGames }));
vi.mock("@/server/providers/Tmdb.server", () => ({
  searchMultimedia: providers.searchMultimedia,
}));

import {
  EMPTY_MEDIA_SEARCH_MESSAGE,
  PROVIDER_UNAVAILABLE_MESSAGE,
} from "@/features/search/search/MediaSearch";
import { searchMedia } from "@/features/search/search/MediaSearch.server";
import { DEPRECATED_MEDIA_MESSAGE } from "@/server/Media";

const movieResult = {
  id: "550",
  mediaType: "movie" as const,
  source: "tmdb" as const,
  title: "Fight Club",
  poster: null,
};

describe("media search", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("reports an empty query without contacting a provider", async () => {
    const outcome = await searchMedia({ query: "   ", mediaType: "book", page: 1 });

    expect(outcome).toEqual({
      status: "empty_query",
      page: 1,
      message: EMPTY_MEDIA_SEARCH_MESSAGE,
    });
    expect(providers.searchBooks).not.toHaveBeenCalled();
  });

  it("rejects deprecated media types with the authoritative message", async () => {
    const outcome = await searchMedia({ query: "naruto", mediaType: "anime", page: 1 });

    expect(outcome).toEqual({
      status: "deprecated_media_type",
      page: 1,
      message: DEPRECATED_MEDIA_MESSAGE,
    });
    expect(providers.searchBooks).not.toHaveBeenCalled();
  });

  it("maps provider failures to a structured unavailable outcome", async () => {
    providers.searchBooks.mockRejectedValue(new Error("provider exploded"));

    const outcome = await searchMedia({ query: "dune", mediaType: "book", page: 1 });

    expect(outcome).toEqual({
      status: "provider_unavailable",
      page: 1,
      message: PROVIDER_UNAVAILABLE_MESSAGE,
    });
  });

  it("returns provider results with normalized pagination", async () => {
    providers.searchBooks.mockResolvedValue({
      results: [{ id: "book-42", title: "A Wizard of Earthsea" }],
      totalResults: 41,
    });

    const outcome = await searchMedia({ query: "le guin", mediaType: "book", page: 2 });

    expect(outcome).toEqual({
      status: "ok",
      results: [{ id: "book-42", title: "A Wizard of Earthsea" }],
      page: 2,
      totalPages: 3,
      totalResults: 41,
    });
    expect(providers.searchBooks).toHaveBeenCalledWith("le guin", 2);
  });

  it("returns TMDB results for movies", async () => {
    providers.searchMultimedia.mockResolvedValue({
      results: [movieResult],
      page: 1,
      total_pages: 1,
      total_results: 1,
    });

    const outcome = await searchMedia({ query: " fight club ", mediaType: "movie", page: 1 });

    expect(outcome).toEqual({
      status: "ok",
      results: [movieResult],
      page: 1,
      totalPages: 1,
      totalResults: 1,
    });
    expect(providers.searchMultimedia).toHaveBeenCalledWith({
      query: "fight club",
      page: 1,
      type: "movie",
    });
  });

  it("normalizes invalid pages before searching", async () => {
    providers.searchBooks.mockResolvedValue({ results: [], totalResults: 0 });

    const outcome = await searchMedia({ query: "dune", mediaType: "book", page: 0 });

    expect(outcome.status).toBe("ok");
    expect(providers.searchBooks).toHaveBeenCalledWith("dune", 1);
  });
});
