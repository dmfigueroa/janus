import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  discoverWatchlistPage,
  findWatchlistItemById,
  findWatchlistItemByProvider,
  findWatchlistItemsByText,
} from "@/features/watchlists/detail/DiscoverWatchlist.server";
import { asMcpContent, asMcpError } from "./McpToolResponse.server";

const mediaTypeSchema = z.enum(["movie", "episode", "game", "book", "comic", "anime", "manga"]);

const itemOutputSchema = z.object({
  id: z.number(),
  watchlistId: z.number(),
  provider: z.string(),
  providerId: z.string(),
  mediaType: mediaTypeSchema,
  title: z.string(),
  parent: z.object({ providerId: z.string().nullable(), title: z.string().nullable() }),
  episode: z.string().nullable(),
  isWatched: z.boolean().nullable(),
});

const selectorSchema = z.union([
  z
    .object({
      watchlistId: z.number().int().positive(),
      watchlistItemId: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      watchlistId: z.number().int().positive(),
      provider: z.string().trim().min(1),
      providerId: z.string().trim().min(1),
      mediaType: mediaTypeSchema,
    })
    .strict(),
  z
    .object({
      watchlistId: z.number().int().positive(),
      query: z.string().trim().min(1),
      pageSize: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional(),
    })
    .strict(),
]);

export function registerWatchlistItemReadTools(
  server: McpServer,
  watchlistSummaryOutputSchema: z.ZodType,
) {
  registerFindWatchlistItems(server);
  registerGetWatchlist(server, watchlistSummaryOutputSchema);
}

function registerFindWatchlistItems(server: McpServer) {
  server.registerTool(
    "find_watchlist_items",
    {
      title: "Find watchlist items",
      description:
        "Find watchlist items by a Janus watchlist item ID or explicit provider, provider ID, and media type.",
      inputSchema: {
        watchlistId: z.number().int().positive(),
        watchlistItemId: z.number().int().positive().optional(),
        provider: z.string().trim().min(1).optional(),
        providerId: z.string().trim().min(1).optional(),
        mediaType: mediaTypeSchema.optional(),
        query: z.string().trim().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
      },
      outputSchema: { items: z.array(itemOutputSchema), nextCursor: z.string().optional() },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (arguments_) => respondToFindWatchlistItems(arguments_),
  );
}

async function respondToFindWatchlistItems(arguments_: Record<string, unknown>) {
  const selection = selectorSchema.safeParse(arguments_);
  if (!selection.success) return asMcpError("Provide one valid watchlist item selector.");
  if ("query" in selection.data) return respondToTextSearch(selection.data);

  const items = await findSelectedItems(selection.data);
  return asMcpContent({ items: items.map(toMcpWatchlistItem) });
}

async function respondToTextSearch(
  selection: Extract<z.infer<typeof selectorSchema>, { query: string }>,
) {
  const page = await findWatchlistItemsByText(selection);
  if (!page) return asMcpError(`Watchlist ${selection.watchlistId} was not found.`);
  return asMcpContent({ items: page.items.map(toMcpWatchlistItem), nextCursor: page.nextCursor });
}

function findSelectedItems(selection: Exclude<z.infer<typeof selectorSchema>, { query: string }>) {
  return "watchlistItemId" in selection
    ? findWatchlistItemById(selection)
    : findWatchlistItemByProvider(selection);
}

function registerGetWatchlist(server: McpServer, watchlistSummaryOutputSchema: z.ZodType) {
  server.registerTool(
    "get_watchlist",
    {
      title: "Get watchlist",
      description: "Get one watchlist with summary counts and a cursor-paginated item page.",
      inputSchema: {
        watchlistId: z.number().int().positive(),
        pageSize: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
      },
      outputSchema: {
        watchlist: watchlistSummaryOutputSchema,
        items: z.array(itemOutputSchema),
        nextCursor: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ watchlistId, pageSize, cursor }) => {
      const page = await discoverWatchlistPage({ watchlistId, pageSize, cursor });
      if (!page) return asMcpError(`Watchlist ${watchlistId} was not found.`);
      return asMcpContent({
        watchlist: page.watchlist,
        items: page.items.map(toMcpWatchlistItem),
        nextCursor: page.nextCursor,
      });
    },
  );
}

function toMcpWatchlistItem(item: {
  id: number;
  watchlistId: number;
  source: string;
  tmdbId: string;
  mediaType: z.infer<typeof mediaTypeSchema>;
  title: string;
  parentId: string | null;
  parentTitle: string | null;
  episode: string | null;
  isWatched: boolean | null;
}) {
  return {
    id: item.id,
    watchlistId: item.watchlistId,
    provider: item.source,
    providerId: item.tmdbId,
    mediaType: item.mediaType,
    title: item.title,
    parent: { providerId: item.parentId, title: item.parentTitle },
    episode: item.episode,
    isWatched: item.isWatched,
  };
}
