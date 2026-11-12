import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  findWatchlistItemMatches,
  findWatchlistItemsByText,
  findWatchlistTitleMatches,
  findWatchlistTitles,
} from "@/features/watchlists/detail/DiscoverWatchlist.server";
import { asMcpContent, asMcpError } from "./McpToolResponse.server";
import {
  itemOutputSchema,
  mediaTypeSchema,
  titleOutputSchema,
  toMcpWatchlistItem,
  watchlistNotFoundOutput,
} from "./WatchlistReadOutput.server";

const selectorSchema = z.union([
  z
    .object({
      watchlistId: z.number().int().positive(),
      watchlistItemId: z.number().int().positive(),
      resultView: z.enum(["items", "titles"]).optional(),
    })
    .strict(),
  z
    .object({
      watchlistId: z.number().int().positive(),
      provider: z.string().trim().min(1),
      providerId: z.string().trim().min(1),
      mediaType: mediaTypeSchema,
      resultView: z.enum(["items", "titles"]).optional(),
    })
    .strict(),
  z
    .object({
      watchlistId: z.number().int().positive(),
      query: z.string().trim().min(1),
      pageSize: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional(),
      resultView: z.enum(["items", "titles"]).optional(),
    })
    .strict(),
]);

type ItemSelection = z.infer<typeof selectorSchema>;
type QuerySelection = Extract<ItemSelection, { query: string }>;
type MatchSelection = Exclude<ItemSelection, QuerySelection>;

export function registerFindWatchlistItemsTool(server: McpServer) {
  server.registerTool(
    "find_watchlist_items",
    {
      title: "Find watchlist items",
      description:
        'Find watchlist items by a Janus watchlist item ID; explicit provider, provider ID, and media type; or case-insensitive title, parent-title, and episode text. Use resultView: "items" | "titles" to choose individual entries or collapsed titles; titles groups all matching episodes from the same TV show, or issues from the same series, into one title result with a matching-item count.',
      inputSchema: {
        watchlistId: z.number().int().positive(),
        watchlistItemId: z.number().int().positive().optional(),
        provider: z.string().trim().min(1).optional(),
        providerId: z.string().trim().min(1).optional(),
        mediaType: mediaTypeSchema.optional(),
        query: z.string().trim().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
        resultView: z.enum(["items", "titles"]).optional(),
      },
      outputSchema: {
        items: z.array(itemOutputSchema).optional(),
        titles: z.array(titleOutputSchema).optional(),
        nextCursor: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (arguments_) => respondToFindWatchlistItems(arguments_),
  );
}

async function respondToFindWatchlistItems(arguments_: Record<string, unknown>) {
  const selection = selectorSchema.safeParse(arguments_);
  if (!selection.success) return asMcpError("Provide one valid watchlist item selector.");

  return selection.data.resultView === "titles"
    ? respondToTitleResults(selection.data)
    : respondToItemResults(selection.data);
}

function respondToItemResults(selection: ItemSelection) {
  return "query" in selection
    ? respondToTextItemSearch(selection)
    : respondToSelectedItems(selection);
}

async function respondToSelectedItems(selection: MatchSelection) {
  const items = await findWatchlistItemMatches(selection);
  return asMcpContent({ items: items.map(toMcpWatchlistItem) });
}

async function respondToTextItemSearch(selection: QuerySelection) {
  const page = await findWatchlistItemsByText(selection);
  if (!page) return watchlistNotFoundOutput(selection.watchlistId);
  return asMcpContent({ items: page.items.map(toMcpWatchlistItem), nextCursor: page.nextCursor });
}

function respondToTitleResults(selection: ItemSelection) {
  return "query" in selection
    ? respondToTextTitleSearch(selection)
    : respondToSelectedTitles(selection);
}

async function respondToSelectedTitles(selection: MatchSelection) {
  return asMcpContent({ titles: await findWatchlistTitleMatches(selection) });
}

async function respondToTextTitleSearch(selection: QuerySelection) {
  const page = await findWatchlistTitles(selection);
  if (!page) return watchlistNotFoundOutput(selection.watchlistId);
  return asMcpContent(page);
}
