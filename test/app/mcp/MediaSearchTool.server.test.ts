import { describe, expect, it } from "vitest";
import { toMcpMediaSearchOutcome } from "@/app/mcp/MediaSearchTool.server";
import { PROVIDER_UNAVAILABLE_MESSAGE } from "@/features/search/search/MediaSearch";
import { DEPRECATED_MEDIA_MESSAGE } from "@/server/Media";

describe("search_media MCP responses", () => {
  it("returns provider results for a successful search", () => {
    const response = toMcpMediaSearchOutcome({
      status: "ok",
      results: [
        {
          id: "550",
          mediaType: "movie",
          source: "tmdb",
          title: "Fight Club",
          poster: null,
          releaseDate: "1999-10-15",
        },
      ],
      page: 1,
      totalPages: 1,
      totalResults: 1,
    });

    expect(response.structuredContent).toEqual({
      success: true,
      results: [
        {
          provider: "tmdb",
          providerId: "550",
          mediaType: "movie",
          title: "Fight Club",
          releaseDate: "1999-10-15",
          year: undefined,
          overview: undefined,
          posterImage: null,
        },
      ],
      page: 1,
      totalPages: 1,
      totalResults: 1,
    });
  });

  it("reports deprecated media types with their own code and message", () => {
    const response = toMcpMediaSearchOutcome({
      status: "deprecated_media_type",
      page: 1,
      message: DEPRECATED_MEDIA_MESSAGE,
    });

    expect(response.structuredContent).toEqual({
      success: false,
      code: "deprecated_media_type",
      message: DEPRECATED_MEDIA_MESSAGE,
    });
  });

  it("reports unavailable providers separately from deprecated media", () => {
    const response = toMcpMediaSearchOutcome({
      status: "provider_unavailable",
      page: 1,
      message: PROVIDER_UNAVAILABLE_MESSAGE,
    });

    expect(response.structuredContent).toEqual({
      success: false,
      code: "provider_unavailable",
      message: PROVIDER_UNAVAILABLE_MESSAGE,
    });
  });

  it("reports empty queries", () => {
    const response = toMcpMediaSearchOutcome({
      status: "empty_query",
      page: 1,
      message: "Enter a search term to find media.",
    });

    expect(response.structuredContent).toEqual({
      success: false,
      code: "empty_query",
      message: "Enter a search term to find media.",
    });
  });
});
