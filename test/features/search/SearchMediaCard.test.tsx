// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "../../utils/Render";
import { SearchMediaCard } from "@/features/search/SearchMediaCard";
import type { UnifiedMedia } from "@/server/Media";

afterEach(() => {
  cleanup();
});

describe("SearchMediaCard", () => {
  const bookMedia: UnifiedMedia = {
    id: "book123",
    mediaType: "book",
    source: "google_books",
    title: "Test Book",
    poster: "https://example.com/cover.jpg",
    year: "2024",
    authors: ["Author One", "Author Two"],
  };

  const movieMedia: UnifiedMedia = {
    id: "movie123",
    mediaType: "movie",
    source: "tmdb",
    title: "Test Movie Different Title",
    poster: "https://example.com/poster.jpg",
    year: "2025",
  };

  it("should display authors for books", () => {
    render(<SearchMediaCard media={bookMedia} onClick={() => {}} />);

    expect(screen.getByText("Author One, Author Two")).toBeDefined();
  });

  it("should not display authors for movies", () => {
    render(<SearchMediaCard media={movieMedia} onClick={() => {}} />);

    expect(screen.getByText("Test Movie Different Title")).toBeDefined();
    expect(screen.queryByText(/Author/)).toBeNull();
  });
});
