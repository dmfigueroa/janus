import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createLineup,
  matchesReference,
  deleteLineup,
  readLineups,
  reorderLineups,
  setLineupWatchlists,
  updateLineup,
} from "@/features/lineups/Lineups.server";
import { asMcpContent } from "./McpToolResponse.server";

const reference = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("system"),
    key: z.enum(["movie", "television", "game", "book", "comic"]),
  }),
  z.object({ kind: z.literal("custom"), id: z.number().int().positive() }),
]);

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
      inputSchema: { lineups: z.array(z.object({ name: z.string() })).min(1) },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ lineups }) => {
      const results = [];
      for (const [index, input] of lineups.entries())
        results.push({ index, ...(await createLineup(input.name)) });
      return asMcpContent({ results });
    },
  );
  server.registerTool(
    "update_lineups",
    {
      description: "Rename or enable lineups.",
      inputSchema: {
        lineups: z
          .array(
            z.object({ reference, name: z.string().optional(), enabled: z.boolean().optional() }),
          )
          .min(1),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ lineups }) => {
      const results = [];
      for (const [index, input] of lineups.entries())
        results.push({ index, ...(await updateLineup(input.reference, input)) });
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
      inputSchema: { lineups: z.array(reference).min(1) },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ lineups }) => {
      const results = [];
      for (const [index, entry] of lineups.entries())
        results.push({ index, ...(await deleteLineup(entry)) });
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
