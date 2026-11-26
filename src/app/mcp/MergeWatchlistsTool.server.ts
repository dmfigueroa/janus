import { executeWriteBatch } from "./ExecuteWriteBatch.server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  mergeWatchlistsSchema,
  type MergeWatchlistsInput,
} from "@/features/watchlists/merge/Mutation";
import { mergeWatchlistsMutation } from "@/features/watchlists/merge/Mutation.server";
import { asMcpContent } from "./McpToolResponse.server";
import { serializeError, serverLogger } from "@/shared/logging/ServerLog.server";

const mergeInputSchema = z
  .object({
    sourceWatchlistIds: z.array(z.number()).catch([]).optional(),
    targetWatchlistId: z.number().catch(0).optional(),
    newWatchlistName: z.string().catch("").optional(),
  })
  .catch({});

type RawMcpMergeInput = z.infer<typeof mergeInputSchema>;

const TARGET_REQUIRED_MESSAGE =
  "Provide either an existing target watchlist ID or a new target name.";

export function registerMergeWatchlistsTool(server: McpServer) {
  server.registerTool(
    "merge_watchlists",
    {
      title: "Merge watchlists",
      description:
        "Merge explicit source watchlists into an existing target or a newly named target. Non-target source watchlists are permanently deleted. Each merge is atomic and processed independently in order; failures leave that merge unchanged. Do not retry a successful merge because its sources no longer exist.",
      inputSchema: { merges: z.array(mergeInputSchema).min(1) },
      outputSchema: {
        results: z.array(
          z.object({
            index: z.number(),
            success: z.boolean(),
            code: z.string(),
            message: z.string(),
            targetWatchlistId: z.number().optional(),
            deletedSourceWatchlistIds: z.array(z.number()).optional(),
          }),
        ),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ merges }) => {
      const results = await executeWriteBatch(merges, mergeResult, "merge_watchlists");
      return asMcpContent({ results });
    },
  );
}

function buildMcpMergeTarget(merge: RawMcpMergeInput) {
  const hasExisting = merge.targetWatchlistId !== undefined;
  const hasNew = merge.newWatchlistName !== undefined;
  if (hasExisting === hasNew) return null;
  return hasExisting
    ? { kind: "existing" as const, watchlistId: merge.targetWatchlistId }
    : { kind: "new" as const, name: merge.newWatchlistName };
}

function firstMergeIssue(issues: ReadonlyArray<{ message: string }>) {
  return issues[0]?.message ?? TARGET_REQUIRED_MESSAGE;
}

function parseValidatedMerge(
  sourceWatchlistIds: number[],
  target: NonNullable<ReturnType<typeof buildMcpMergeTarget>>,
) {
  const parsed = mergeWatchlistsSchema.safeParse({ sourceWatchlistIds, target });
  if (!parsed.success) {
    return { success: false as const, message: firstMergeIssue(parsed.error.issues) };
  }
  return { success: true as const, data: parsed.data };
}

function parseMcpMergeInput(
  merge: RawMcpMergeInput,
): { success: true; data: MergeWatchlistsInput } | { success: false; message: string } {
  const target = buildMcpMergeTarget(merge);
  if (!target) return { success: false, message: TARGET_REQUIRED_MESSAGE };
  return parseValidatedMerge(merge.sourceWatchlistIds ?? [], target);
}

async function mergeResult(merge: RawMcpMergeInput, index: number) {
  const parsed = parseMcpMergeInput(merge);
  if (!parsed.success) {
    return { index, success: false, code: "validation_error", message: parsed.message };
  }

  const startedAt = performance.now();
  const result = await mergeWatchlistsMutation(parsed.data).catch((error: unknown) => {
    serverLogger("error", "mcp.operation.failed", {
      tool: "merge_watchlists",
      operation: "merge_watchlists",
      index,
      targetWatchlistId: merge.targetWatchlistId,
      outcome: "internal_error",
      durationMs: Math.round(performance.now() - startedAt),
      error: serializeError(error),
    });
    return {
      success: false as const,
      code: "internal_error",
      message: "The merge failed. No changes were made for this operation.",
    };
  });
  if (!result.success) return { index, ...result };
  return {
    index,
    success: true,
    code: "merged",
    message: "Watchlists merged.",
    targetWatchlistId: result.targetId,
    deletedSourceWatchlistIds: [...new Set(parsed.data.sourceWatchlistIds)].filter(
      (id) => id !== result.targetId,
    ),
  };
}
