import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  listWatchlistSummaryPage,
  searchWatchlistSummaryPage,
} from "@/features/watchlists/list/Query.server";
import { searchMedia, type MediaSearchPage } from "@/features/search/MediaSearch.server";
import { searchableMediaTypes } from "@/features/search/MediaSearch";
import { handleMcpSessionRequest } from "@/integrations/mcp/McpSessionTransport.server";
import { asMcpContent } from "./McpToolResponse.server";
import { registerWatchlistItemReadTools } from "./WatchlistItemReadTools.server";

const watchlistSummaryOutputSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  itemOrderMode: z.enum(["release", "custom"]),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
  lastWatchedAt: z.string().nullable(),
  lastItemAddedAt: z.string().nullable(),
  stats: z.object({
    totalItems: z.number(),
    watchedItems: z.number(),
    progress: z.number(),
    nextUnwatched: z.unknown().nullable(),
    coverImage: z.string().nullable(),
    coverMediaType: z
      .enum(["movie", "episode", "game", "book", "comic", "anime", "manga"])
      .nullable(),
  }),
});

const watchlistPageInputSchema = {
  orderBy: z.enum(["createdAt", "lastWatched", "lastAdded"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
};

export function handleMcpEndpointRequest(request: Request) {
  return handleMcpSessionRequest(request, createMcpServer);
}

function createMcpServer() {
  const server = new McpServer({ name: "janus", version: "1.0.0" });
  registerWatchlistItemReadTools(server, watchlistSummaryOutputSchema);
  registerWatchlistSummaryTools(server);
  registerSearchMedia(server);
  return server;
}

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

function toMcpMediaSearchResponse(page: MediaSearchPage) {
  return {
    success: true,
    results: page.results.map((item) => ({
      provider: item.source,
      providerId: item.id,
      mediaType: item.mediaType,
      title: item.title,
      releaseDate: item.releaseDate,
      year: item.year,
      overview: item.overview,
      posterImage: item.poster,
    })),
    page: page.page,
    totalPages: page.total_pages,
    totalResults: page.total_results,
  };
}

function unavailableProviderResponse(message: string) {
  return asMcpContent({ success: false, code: "provider_unavailable", message });
}

function toMcpMediaSearchOutcome(searchPage: MediaSearchPage) {
  if (searchPage.rejected) {
    return unavailableProviderResponse(
      searchPage.message ?? "This provider category is unavailable.",
    );
  }
  return asMcpContent(toMcpMediaSearchResponse(searchPage));
}

function registerSearchMedia(server: McpServer) {
  server.registerTool(
    "search_media",
    {
      title: "Search supported media providers",
      description:
        "Search TMDB for movies and TV, RAWG for games, Google Books for books, ComicVine for comics, or AniList for anime and manga. Anime and manga search remains unavailable while Janus reviews provider data quality.",
      inputSchema: {
        query: z.string().trim().min(1),
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
      searchMedia({ query, mediaType, page })
        .then(toMcpMediaSearchOutcome)
        .catch(() =>
          unavailableProviderResponse(
            "The selected provider is unavailable. Please try again later.",
          ),
        ),
  );
}

function registerWatchlistSummaryTools(server: McpServer) {
  registerListWatchlists(server);
  registerSearchWatchlists(server);
}

function registerListWatchlists(server: McpServer) {
  server.registerTool(
    "list_watchlists",
    {
      title: "List watchlists",
      description: "List watchlist summaries using Janus's supported sort order.",
      inputSchema: watchlistPageInputSchema,
      outputSchema: {
        watchlists: z.array(watchlistSummaryOutputSchema),
        nextCursor: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ orderBy, order, pageSize, cursor }) =>
      asMcpContent(await listWatchlistSummaryPage({ orderBy, order, pageSize, cursor })),
  );
}

function registerSearchWatchlists(server: McpServer) {
  server.registerTool(
    "search_watchlists",
    {
      title: "Search watchlists",
      description: "Find watchlist summaries by a case-insensitive partial name.",
      inputSchema: { query: z.string().trim().min(1), ...watchlistPageInputSchema },
      outputSchema: {
        watchlists: z.array(watchlistSummaryOutputSchema),
        nextCursor: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ query, orderBy, order, pageSize, cursor }) =>
      asMcpContent(await searchWatchlistSummaryPage({ query, orderBy, order, pageSize, cursor })),
  );
}
