import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { lineupReferenceSchema } from "@/features/lineups/LineupReference";

const action = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string(),
    watchlistIds: z.array(z.number().int().positive()),
  }),
  z.object({
    action: z.literal("edit"),
    reference: lineupReferenceSchema,
    name: z.string(),
    watchlistIds: z.array(z.number().int().positive()),
  }),
  z.object({ action: z.literal("enable"), reference: lineupReferenceSchema, enabled: z.boolean() }),
  z.object({ action: z.literal("delete"), reference: lineupReferenceSchema }),
  z.object({ action: z.literal("reorder"), references: z.array(lineupReferenceSchema) }),
]);
export type LineupAction = z.infer<typeof action>;

export const getLineupData = createServerFn().handler(async () => {
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  const { readLineups } = await import("@/features/lineups/read/LineupRead.server");
  const { listWatchlistSummaries } = await import("@/features/watchlists/list/Query.server");
  setResponseHeader("cache-control", "private, no-cache");
  return {
    lineups: await readLineups(),
    watchlists: await listWatchlistSummaries({ orderBy: "recency" }),
  };
});

export const changeLineup = createServerFn({ method: "POST" })
  .validator(action)
  .handler(async ({ data }) => {
    const { executeLineupAction } =
      await import("@/features/lineups/manage/LineupConfiguration.server");
    return executeLineupAction(data);
  });

export type LineupData = Awaited<ReturnType<typeof getLineupData>>;
