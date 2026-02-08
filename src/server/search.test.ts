import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database
const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    all: vi.fn(),
    groupBy: vi.fn(),
  },
}));

vi.mock("../db", () => ({
  db: mockDb,
}));

// Mock utils/search
vi.mock("../utils/search", () => ({
  escapeLikeString: (s: string) => s,
}));

// Import searchUnifiedHandler AFTER mocking
import { searchUnifiedHandler } from "./search-api";
import { searchMultimedia } from "./tmdb";
import { searchBooks } from "./google-books";
import { searchGames } from "./rawg";
import { searchComics } from "./comicvine";

// Mock the external API search functions
vi.mock("./tmdb", () => ({
  searchMultimedia: vi.fn(),
}));
vi.mock("./google-books", () => ({
  searchBooks: vi.fn(),
}));
vi.mock("./rawg", () => ({
  searchGames: vi.fn(),
}));
vi.mock("./comicvine", () => ({
  searchComics: vi.fn(),
}));

// Mock watchlistItems schema
vi.mock("../db/schema", () => ({
  watchlistItems: {
    source: "source",
    mediaType: "mediaType",
    title: "title",
    watchlistId: "watchlistId",
    tmdbId: "tmdbId",
    posterPath: "posterPath",
    releaseDate: "releaseDate",
    voteAverage: "voteAverage",
  },
}));

describe("searchUnifiedHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    // Default mock implementation
    mockDb.groupBy.mockResolvedValue([]);
  });

  it("should return external API results for movies", async () => {
    const mockResults = {
      results: [{ id: "1", title: "Test Movie", mediaType: "movie", source: "tmdb" }],
      page: 1,
      total_pages: 1,
      total_results: 1,
    };
    (searchMultimedia as any).mockResolvedValue(mockResults);

    const result = await searchUnifiedHandler({ data: { query: "Test", type: "movie", page: 1 } });

    expect(searchMultimedia).toHaveBeenCalledWith({ data: { query: "Test", page: 1, type: "movie" } });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe("Test Movie");
  });

  it("should return custom items from DB", async () => {
    const mockResults = {
      results: [],
      page: 1,
      total_pages: 0,
      total_results: 0,
    };
    (searchMultimedia as any).mockResolvedValue(mockResults);

    // Mock DB to return one custom item
    mockDb.groupBy.mockResolvedValue([
      {
        id: "custom-1",
        title: "My Custom Movie",
        mediaType: "movie",
        posterPath: "/custom.jpg",
        releaseDate: "2023-01-01",
        voteAverage: 5,
        source: "custom",
      },
    ]);

    const result = await searchUnifiedHandler({ data: { query: "Custom", type: "movie", page: 1 } });

    expect(searchMultimedia).toHaveBeenCalled();
    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe("My Custom Movie");
    expect(result.results[0].source).toBe("custom");
  });
});
