import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchMedia } from "@/features/search/search/MediaSearch.server";
import {
  searchableMediaTypes,
  type MediaSearchOutcome,
  type MediaSearchSuccess,
} from "@/features/search/search/MediaSearch";
import { asMcpContent } from "./McpToolResponse.server";

const mediaSearchResultSchema = z.object({
  provider: z.enum(["tmdb", "rawg", "google_books", "comicvine", "anilist"]),
  providerId: z.string(),
  mediaType: z.enum(searchableMediaTypes),
  title: z.string(),
  releaseDate: z.string().optional(),
  year: z.string().optional(),
  overview: z.string().optional(),
  posterImage: z.string().nullable(),
});

function toMcpMediaSearchResponse(outcome: MediaSearchSuccess) {
  return {
    success: true,
    results: outcome.results.map((item) => ({
      provider: item.source,
      providerId: item.id,
      mediaType: item.mediaType,
      title: item.title,
      releaseDate: item.releaseDate,
      year: item.year,
      overview: item.overview,
      posterImage: item.poster,
    })),
    page: outcome.page,
    totalPages: outcome.totalPages,
    totalResults: outcome.totalResults,
  };
}

export function toMcpMediaSearchOutcome(outcome: MediaSearchOutcome) {
  if (outcome.status === "ok") return asMcpContent(toMcpMediaSearchResponse(outcome));

  return asMcpContent({
    success: false,
    code: outcome.status,
    message: outcome.message,
  });
}

export function registerSearchMedia(server: McpServer) {
  server.registerTool(
    "search_media",
    {
      title: "Search supported media providers",
      description:
        "Search TMDB for movies and TV, RAWG for games, Google Books for books, ComicVine for comics, or AniList for anime and manga. Anime and manga search remains unavailable while Janus reviews provider data quality.",
      inputSchema: {
        query: z.string(),
        mediaType: z.enum(searchableMediaTypes),
        page: z.number().int().min(1).max(100).default(1),
      },
      outputSchema: {
        success: z.boolean(),
        code: z.string().optional(),
        message: z.string().optional(),
        results: z.array(mediaSearchResultSchema).optional(),
        page: z.number().optional(),
        totalPages: z.number().optional(),
        totalResults: z.number().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ query, mediaType, page }) =>
      toMcpMediaSearchOutcome(await searchMedia({ query, mediaType, page })),
  );
}
