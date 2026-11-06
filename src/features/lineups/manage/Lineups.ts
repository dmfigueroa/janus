import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const reference = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("system"),
    key: z.enum(["movie", "television", "game", "book", "comic"]),
  }),
  z.object({ kind: z.literal("custom"), id: z.number().int().positive() }),
]);
const action = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string(),
    watchlistIds: z.array(z.number().int().positive()),
  }),
  z.object({
    action: z.literal("edit"),
    reference,
    name: z.string(),
    watchlistIds: z.array(z.number().int().positive()),
  }),
  z.object({ action: z.literal("enable"), reference, enabled: z.boolean() }),
  z.object({ action: z.literal("delete"), reference }),
  z.object({ action: z.literal("reorder"), references: z.array(reference) }),
]);
export type LineupAction = z.infer<typeof action>;
export const getLineupData = createServerFn().handler(async () => {
  const { readLineups } = await import("@/features/lineups/read/LineupRead.server");
  const { listWatchlistSummaries } = await import("@/features/watchlists/list/Query.server");
  return {
    lineups: await readLineups(),
    watchlists: await listWatchlistSummaries({ orderBy: "recency" }),
  };
});
export const changeLineup = createServerFn({ method: "POST" })
  .validator(action)
  .handler(async ({ data }) => {
    const { executeLineupAction } = await import("@/features/lineups/manage/LineupActions.server");
    return executeLineupAction(data);
  });
export type LineupData = Awaited<ReturnType<typeof getLineupData>>;
