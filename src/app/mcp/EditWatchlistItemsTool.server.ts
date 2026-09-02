import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { editWatchlistItemSchema } from "@/features/watchlists/edit/Mutation";
import { editWatchlistItemMutation } from "@/features/watchlists/edit/Mutation.server";
import { asMcpContent } from "./McpToolResponse.server";

const editResultSchema = z.object({
  index: z.number().int().nonnegative(),
  success: z.boolean(),
  code: z.string(),
  message: z.string(),
  watchlistId: z.number().optional(),
  watchlistItemId: z.number().optional(),
});

const editWatchlistItemInputSchema = z.object({
  watchlistId: z.number().optional(),
  watchlistItemId: z.number().optional(),
  title: z.string().optional(),
  releaseDate: z.union([z.string(), z.null()]).optional(),
  posterImage: z.union([z.string(), z.null()]).optional(),
});

export function registerEditWatchlistItemsTool(server: McpServer) {
  server.registerTool(
    "edit_watchlist_items",
    {
      title: "Edit watchlist item metadata",
      description:
        "Edit the stored title, release date, and poster image of one or more watchlist items. Each edit targets a stable internal watchlist item ID and is processed independently, returning an ordered result. Poster image must be an HTTPS URL or a provider path beginning with /. Release date must be YYYY or YYYY-MM-DD.",
      inputSchema: { edits: z.array(editWatchlistItemInputSchema).min(1) },
      outputSchema: { results: z.array(editResultSchema) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ edits }) =>
      asMcpContent({
        results: await Promise.all(edits.map(editWatchlistItemResult)),
      }),
  );
}

async function editWatchlistItemResult(
  input: z.infer<typeof editWatchlistItemInputSchema>,
  index: number,
) {
  const parsedInput = editWatchlistItemSchema.safeParse(toEditWatchlistItemInput(input));
  if (!parsedInput.success) {
    return invalidEditResult(input, index, parsedInput.error);
  }

  const result = await editWatchlistItemMutation(parsedInput.data);
  if (!result.success) return editNotFoundResult(index, parsedInput.data, result.message);

  return {
    index,
    success: true,
    code: "edited",
    message: "Watchlist item edited.",
    watchlistId: parsedInput.data.watchlistId,
    watchlistItemId: parsedInput.data.itemId,
  };
}

function invalidEditResult(
  input: z.infer<typeof editWatchlistItemInputSchema>,
  index: number,
  error: z.ZodError,
) {
  return {
    index,
    success: false,
    code: "validation_error",
    message: error.issues[0]?.message ?? "Invalid watchlist item edit.",
    watchlistId: input.watchlistId,
    watchlistItemId: input.watchlistItemId,
  };
}

function editNotFoundResult(
  index: number,
  input: z.infer<typeof editWatchlistItemSchema>,
  message: string,
) {
  return {
    index,
    success: false,
    code: "not_found",
    message,
    watchlistId: input.watchlistId,
    watchlistItemId: input.itemId,
  };
}

function toEditWatchlistItemInput(input: z.infer<typeof editWatchlistItemInputSchema>) {
  return {
    watchlistId: input.watchlistId,
    itemId: input.watchlistItemId,
    title: input.title,
    releaseDate: input.releaseDate,
    posterPath: input.posterImage,
  };
}
