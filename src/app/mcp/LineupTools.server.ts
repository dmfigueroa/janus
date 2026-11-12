import { executeWriteBatch } from "./ExecuteWriteBatch.server";
import { readLineup, readLineups } from "@/features/lineups/read/LineupRead.server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createLineup,
  deleteLineup,
  reorderLineups,
  setLineupWatchlists,
  updateLineup,
} from "@/features/lineups/manage/LineupConfiguration.server";
import { lineupReferenceSchema } from "@/features/lineups/LineupReference";
import { asMcpContent } from "./McpToolResponse.server";

const createInput = z.object({ name: z.string() });
const updateInput = z.object({
  reference: lineupReferenceSchema,
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
      inputSchema: { reference: lineupReferenceSchema },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ reference: requested }) => {
      const lineup = await readLineup(requested);
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
      const results = await executeWriteBatch(lineups, (input, index) =>
        batchResult(input, index, createInput, ({ name }) => createLineup(name), "created"),
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
      const results = await executeWriteBatch(lineups, (input, index) =>
        batchResult(
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
      inputSchema: {
        reference: lineupReferenceSchema,
        watchlistIds: z.array(z.number().int().positive()),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ reference, watchlistIds }) =>
      asMcpContent(await setLineupWatchlists(reference, watchlistIds)),
  );
  server.registerTool(
    "delete_lineups",
    {
      description: "Delete custom lineups without deleting watchlists.",
      inputSchema: { lineups: z.array(z.union([lineupReferenceSchema, z.unknown()])).min(1) },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ lineups }) => {
      const results = await executeWriteBatch(lineups, (entry, index) =>
        batchResult(entry, index, lineupReferenceSchema, deleteLineup, "deleted"),
      );
      return asMcpContent({ results });
    },
  );
  server.registerTool(
    "reorder_lineups",
    {
      description: "Replace the complete order of all lineups.",
      inputSchema: { lineups: z.array(lineupReferenceSchema) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ lineups }) => asMcpContent(await reorderLineups(lineups)),
  );
}
