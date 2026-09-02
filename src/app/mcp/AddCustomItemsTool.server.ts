import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  customItemAdditionSchema,
  type CustomItemAddition,
} from "@/features/watchlists/add/AddCustomItem";
import { addCustomItemToWatchlist } from "@/features/watchlists/add/AddCustomItem.server";
import { asMcpContent } from "./McpToolResponse.server";

const customItemAdditionResultSchema = z.object({
  index: z.number().int().nonnegative(),
  success: z.boolean(),
  code: z.string(),
  message: z.string(),
  watchlistId: z.number().optional(),
  mediaType: z.enum(["movie", "tv", "book", "game", "comic"]).optional(),
  affectedCount: z.number().int().nonnegative(),
});

const customItemAdditionInputSchema = z.object({
  watchlistId: z.number().optional(),
  title: z.string().optional(),
  mediaType: z.enum(["movie", "tv", "book", "game", "comic"]).optional(),
  year: z.string().optional(),
  insertionPosition: z.enum(["beginning", "end", "release-adjacent"]).optional(),
});

export function registerAddCustomItemsToWatchlistsTool(server: McpServer) {
  server.registerTool(
    "add_custom_items_to_watchlists",
    {
      title: "Add custom watchlist items without a provider source",
      description:
        "Add one or more manually described items (movie, TV, book, game, or comic) to watchlists without a provider ID. Janus stores the supplied title and optional year directly and does not fetch canonical metadata. Custom TV items are rejected because TV shows must come from TMDB so Janus can expand them into episodes. Custom-ordered destinations require an explicit insertion position. Each requested addition is processed independently and returns an ordered result.",
      inputSchema: { items: z.array(customItemAdditionInputSchema).min(1) },
      outputSchema: { results: z.array(customItemAdditionResultSchema) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ items }) =>
      asMcpContent({
        results: await Promise.all(items.map(addCustomItemResult)),
      }),
  );
}

async function addCustomItemResult(
  input: z.infer<typeof customItemAdditionInputSchema>,
  index: number,
) {
  const parsedInput = customItemAdditionSchema.safeParse(input);
  if (!parsedInput.success) {
    return invalidCustomItemAdditionResult(input, index, parsedInput.error);
  }

  return customItemResult(parsedInput.data, index);
}

function invalidCustomItemAdditionResult(
  input: z.infer<typeof customItemAdditionInputSchema>,
  index: number,
  error: z.ZodError,
) {
  return {
    index,
    success: false,
    code: "validation_error",
    message: error.issues[0]?.message ?? "Invalid custom item addition.",
    watchlistId: input.watchlistId,
    mediaType: input.mediaType,
    affectedCount: 0,
  };
}

async function customItemResult(addition: CustomItemAddition, index: number) {
  const result = await addCustomItemToWatchlist(addition);
  return {
    index,
    ...result,
    watchlistId: addition.watchlistId,
    mediaType: addition.mediaType,
  };
}
