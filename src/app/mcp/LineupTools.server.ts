import { deleteLineup } from "@/features/lineups/manage/DeleteLineup.server";
import { matchesReference } from "@/features/lineups/read/LineupConfigurationRead.server";
import { readLineups } from "@/features/lineups/read/LineupRead.server";
import { reorderLineups } from "@/features/lineups/manage/ReorderLineups.server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createLineup,
  setLineupWatchlists,
  updateLineup,
} from "@/features/lineups/manage/LineupConfiguration.server";
import { asMcpContent } from "./McpToolResponse.server";

const reference = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("system"),
    key: z.enum(["movie", "television", "game", "book", "comic"]),
  }),
  z.object({ kind: z.literal("custom"), id: z.number().int().positive() }),
]);

const createInput = z.object({ name: z.string() });
const updateInput = z.object({
  reference,
  name: z.string().optional(),
  enabled: z.boolean().optional(),
});
async function batchResult<T>(
  input: unknown,
  index: number,
  schema: z.ZodType<T>,
  operation: (value: T) => Promise<{ success: boolean; code?: string; message?: string }>,
  successCode: string,
) {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return {
      index,
      success: false,
      code: "validation_error",
      message: "Invalid lineup input.",
    };
  const outcome = await operation(parsed.data);
  return formatBatchResult(index, outcome, successCode);
}
function formatBatchResult(
  index: number,
  outcome: { success: boolean; code?: string; message?: string },
  successCode: string,
) {
  const defaults = batchDefaults(outcome.success, successCode);
  return {
    index,
    ...outcome,
    code: outcome.code ?? defaults.code,
    message: outcome.message ?? defaults.message,
  };
}
function batchDefaults(success: boolean, successCode: string) {
  return success
    ? { code: successCode, message: "Lineup updated." }
    : { code: "validation_error", message: "Lineup change failed." };
}

export function registerLineupTools(server: McpServer) {
  server.registerTool(
    "list_lineups",
    {
      description: "List all lineups in configured order.",
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async () => asMcpContent({ lineups: await readLineups() }),
  );
  server.registerTool(
    "get_lineup",
    {
      description: "Read configured and eligible watchlists in a lineup.",
      inputSchema: { reference },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ reference: requested }) => {
      const lineup = (await readLineups()).find((entry) => matchesReference(entry, requested));
      return asMcpContent(
        lineup
          ? { success: true, lineup }
          : { success: false, code: "not_found", message: "Lineup not found." },
      );
    },
  );
  server.registerTool(
    "create_lineups",
    {
      description: "Create custom lineups in order.",
      inputSchema: { lineups: z.array(z.union([createInput, z.unknown()])).min(1) },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ lineups }) => {
      const results = [];
      for (const [index, input] of lineups.entries())
        results.push(
          await batchResult(input, index, createInput, ({ name }) => createLineup(name), "created"),
        );
      return asMcpContent({ results });
    },
  );
  server.registerTool(
    "update_lineups",
    {
      description: "Rename or enable lineups.",
      inputSchema: {
        lineups: z.array(z.union([updateInput, z.unknown()])).min(1),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ lineups }) => {
      const results = [];
      for (const [index, input] of lineups.entries())
        results.push(
          await batchResult(
            input,
            index,
            updateInput,
            (value) => updateLineup(value.reference, value),
            "updated",
          ),
        );
      return asMcpContent({ results });
    },
  );
  server.registerTool(
    "set_lineup_watchlists",
    {
      description: "Replace all configured watchlists in a custom lineup.",
      inputSchema: { reference, watchlistIds: z.array(z.number().int().positive()) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ reference, watchlistIds }) =>
      asMcpContent(await setLineupWatchlists(reference, watchlistIds)),
  );
  server.registerTool(
    "delete_lineups",
    {
      description: "Delete custom lineups without deleting watchlists.",
      inputSchema: { lineups: z.array(z.union([reference, z.unknown()])).min(1) },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ lineups }) => {
      const results = [];
      for (const [index, entry] of lineups.entries())
        results.push(await batchResult(entry, index, reference, deleteLineup, "deleted"));
      return asMcpContent({ results });
    },
  );
  server.registerTool(
    "reorder_lineups",
    {
      description: "Replace the complete order of all lineups.",
      inputSchema: { lineups: z.array(reference) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ lineups }) => asMcpContent(await reorderLineups(lineups)),
  );
}
