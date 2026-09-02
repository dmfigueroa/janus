import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createWatchlistMutation } from "@/features/watchlists/create/Mutation.server";
import { createWatchlistSchema } from "@/features/watchlists/create/Mutation";
import { updateWatchlistMutation } from "@/features/watchlists/update/Mutation.server";
import { updateWatchlistSchema } from "@/features/watchlists/update/Mutation";
import { deleteWatchlistMutation } from "@/features/watchlists/delete/Mutation.server";
import { skipWatchlistMutation } from "@/features/watchlists/skip/Mutation.server";
import { asMcpContent } from "./McpToolResponse.server";
import { batchResultSchema, validationErrorResult } from "./BatchResult.server";
import { registerAddMediaToWatchlistsTool } from "./AddMediaToWatchlistsTool.server";
import { registerAddCustomItemsToWatchlistsTool } from "./AddCustomItemsTool.server";
import { registerEditWatchlistItemsTool } from "./EditWatchlistItemsTool.server";
import { registerSetWatchlistItemsWatchedTool } from "./SetWatchlistItemsWatchedTool.server";
import { registerRemoveWatchlistItemsTool } from "./RemoveWatchlistItemsTool.server";
import { registerRemoveWatchlistParentsTool } from "./RemoveWatchlistParentsTool.server";

const createWatchlistInputSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  itemOrderMode: z.enum(["release", "custom"]).optional(),
});

const updateWatchlistInputSchema = z.object({
  watchlistId: z.number().optional(),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  itemOrderMode: z.enum(["release", "custom"]).optional(),
});

export function registerWatchlistWriteTools(server: McpServer) {
  registerCreateWatchlists(server);
  registerUpdateWatchlists(server);
  registerDeleteWatchlists(server);
  registerAddMediaToWatchlistsTool(server);
  registerAddCustomItemsToWatchlistsTool(server);
  registerEditWatchlistItemsTool(server);
  registerSetWatchlistItemsWatchedTool(server);
  registerRemoveWatchlistItemsTool(server);
  registerRemoveWatchlistParentsTool(server);
  registerSkipWatchlists(server);
}

function registerCreateWatchlists(server: McpServer) {
  server.registerTool(
    "create_watchlists",
    {
      title: "Create watchlists",
      description:
        "Create one or more watchlists. Each requested watchlist is processed independently and returns an ordered result.",
      inputSchema: { watchlists: z.array(createWatchlistInputSchema).min(1) },
      outputSchema: { results: z.array(batchResultSchema) },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ watchlists }) =>
      asMcpContent({
        results: await Promise.all(watchlists.map(createWatchlistResult)),
      }),
  );
}

function registerUpdateWatchlists(server: McpServer) {
  server.registerTool(
    "update_watchlists",
    {
      title: "Update watchlists",
      description:
        "Update one or more watchlists. Each requested watchlist is processed independently and returns an ordered result.",
      inputSchema: { watchlists: z.array(updateWatchlistInputSchema).min(1) },
      outputSchema: { results: z.array(batchResultSchema) },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ watchlists }) =>
      asMcpContent({
        results: await Promise.all(watchlists.map(updateWatchlistResult)),
      }),
  );
}

function registerDeleteWatchlists(server: McpServer) {
  server.registerTool(
    "delete_watchlists",
    {
      title: "Delete watchlists",
      description:
        "Permanently delete one or more watchlists and their watchlist items. Each requested watchlist is processed independently and returns an ordered result.",
      inputSchema: { watchlistIds: z.array(z.number().int().positive()).min(1) },
      outputSchema: { results: z.array(batchResultSchema) },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ watchlistIds }) =>
      asMcpContent({
        results: await Promise.all(watchlistIds.map(deleteWatchlistResult)),
      }),
  );
}

function registerSkipWatchlists(server: McpServer) {
  server.registerTool(
    "skip_watchlists",
    {
      title: "Skip watchlists",
      description:
        "Skip one or more watchlists using Janus's existing recency behavior. Each requested watchlist is processed independently and returns an ordered result.",
      inputSchema: { watchlistIds: z.array(z.number().int().positive()).min(1) },
      outputSchema: { results: z.array(batchResultSchema) },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ watchlistIds }) =>
      asMcpContent({
        results: await Promise.all(watchlistIds.map(skipWatchlistResult)),
      }),
  );
}

async function createWatchlistResult(
  input: z.infer<typeof createWatchlistInputSchema>,
  index: number,
) {
  const parsedInput = createWatchlistSchema.safeParse(input);
  if (!parsedInput.success) return validationErrorResult(index, parsedInput.error);

  const watchlist = await createWatchlistMutation(parsedInput.data);
  return {
    index,
    success: true,
    code: "created",
    message: "Watchlist created.",
    watchlist: {
      id: watchlist.id,
      name: watchlist.name,
      description: watchlist.description,
      itemOrderMode: watchlist.itemOrderMode,
    },
  };
}

async function updateWatchlistResult(
  input: z.infer<typeof updateWatchlistInputSchema>,
  index: number,
) {
  const parsedInput = updateWatchlistSchema.safeParse(input);
  if (!parsedInput.success)
    return validationErrorResult(index, parsedInput.error, input.watchlistId);

  const result = await updateWatchlistMutation(parsedInput.data);
  if (!result.success) {
    return {
      index,
      success: false,
      code: "not_found",
      message: result.message,
      watchlistId: parsedInput.data.watchlistId,
    };
  }

  return {
    index,
    success: true,
    code: "updated",
    message: "Watchlist updated.",
    watchlistId: parsedInput.data.watchlistId,
  };
}

async function deleteWatchlistResult(watchlistId: number, index: number) {
  const result = await deleteWatchlistMutation({ id: watchlistId });
  if (!result.success) {
    return {
      index,
      success: false,
      code: "not_found",
      message: result.message,
      watchlistId,
    };
  }

  return { index, success: true, code: "deleted", message: "Watchlist deleted.", watchlistId };
}

async function skipWatchlistResult(watchlistId: number, index: number) {
  const result = await skipWatchlistMutation({ watchlistId });
  if (!result.success) {
    return {
      index,
      success: false,
      code: "not_found",
      message: result.message,
      watchlistId,
    };
  }

  return { index, success: true, code: "skipped", message: "Watchlist skipped.", watchlistId };
}
