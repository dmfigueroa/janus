import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "../db";

// Mock dependencies
vi.mock("../db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("../utils/search", () => ({
  escapeLikeString: (s: string) => s,
}));

vi.mock("./tmdb", () => ({
  searchMultimedia: vi.fn(),
}));

vi.mock("./google-books", () => ({ searchBooks: vi.fn() }));
vi.mock("./rawg", () => ({ searchGames: vi.fn() }));
vi.mock("./comicvine", () => ({ searchComics: vi.fn() }));

import { searchCustomItems, searchUnifiedHandler } from "./search-logic";
import { searchMultimedia } from "./tmdb";

describe("searchCustomItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return formatted UnifiedMedia items", async () => {
    const mockItems = [
      {
        id: "custom-1",
        mediaType: "movie",
        title: "Custom Movie",
        posterPath: "/poster.jpg",
        releaseDate: "2023-01-01",
        voteAverage: 8.5,
      },
    ];

    const mockSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockResolvedValue(mockItems),
    };

    (db.select as any).mockReturnValue(mockSelect);

    const results = await searchCustomItems("query", "movie");

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      id: "custom-1",
      mediaType: "movie",
      source: "custom",
      title: "Custom Movie",
      poster: "/poster.jpg",
      year: "2023",
      releaseDate: "2023-01-01",
      rating: 8.5,
      overview: "",
      backdrop: null,
    });
  });
});

describe("searchUnifiedHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should merge custom items with external results for movies", async () => {
    const mockCustomItems = [
      {
        id: "custom-1",
        mediaType: "movie",
        title: "Custom Movie",
        posterPath: null,
        releaseDate: "2023-01-01",
        voteAverage: 5,
      },
    ];
    const mockSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockResolvedValue(mockCustomItems),
    };
    (db.select as any).mockReturnValue(mockSelect);

    (searchMultimedia as any).mockResolvedValue({
      results: [
        {
          id: "tmdb-1",
          mediaType: "movie",
          source: "tmdb",
          title: "TMDB Movie",
          poster: null,
        },
      ],
      total_results: 1,
      total_pages: 1,
      page: 1,
    });

    const result = await searchUnifiedHandler({ data: { query: "test", type: "movie", page: 1 } });

    expect(result.results).toHaveLength(2);
    expect(result.results[0].id).toBe("custom-1");
    expect(result.results[1].id).toBe("tmdb-1");
    expect(result.total_results).toBe(2);
  });

  it("should not fetch custom items on page 2", async () => {
    (db.select as any).mockClear();

    (searchMultimedia as any).mockResolvedValue({
      results: [],
      total_results: 10,
      total_pages: 2,
      page: 2,
    });

    const result = await searchUnifiedHandler({ data: { query: "test", type: "movie", page: 2 } });

    expect(db.select).not.toHaveBeenCalled();
    expect(result.results).toHaveLength(0);
  });
});
