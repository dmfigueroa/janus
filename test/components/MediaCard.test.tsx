// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MediaCard } from "@/components/MediaCard";
import type { UnifiedMedia } from "@/server/Media";

afterEach(() => {
  cleanup();
});

describe("MediaCard", () => {
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
    render(<MediaCard media={bookMedia} onClick={() => {}} />);

    expect(screen.getByText("Author One, Author Two")).toBeDefined();
  });

  it("should not display authors for movies", () => {
    render(<MediaCard media={movieMedia} onClick={() => {}} />);

    expect(screen.getByText("Test Movie Different Title")).toBeDefined();
    expect(screen.queryByText(/Author/)).toBeNull();
  });
});
