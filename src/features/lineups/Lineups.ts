import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  deleteLineup,
  readLineups,
  reorderLineups,
  saveCustomLineup,
  updateLineup,
} from "./Lineups.server";
import { listWatchlistSummaries } from "@/features/watchlists/list/Query.server";

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
export const getLineupData = createServerFn().handler(async () => ({
  lineups: await readLineups(),
  watchlists: await listWatchlistSummaries({ orderBy: "recency" }),
}));
export const changeLineup = createServerFn({ method: "POST" })
  .validator(action)
  .handler(async ({ data }) => {
    if (data.action === "create") return saveCustomLineup(data);
    if (data.action === "edit") return editCustom(data);
    return applyConfiguration(data);
  });
function editCustom(data: Extract<LineupAction, { action: "edit" }>) {
  if (data.reference.kind === "system")
    return { success: false as const, message: "Automatic lineups cannot be edited." };
  return saveCustomLineup({
    id: data.reference.id,
    name: data.name,
    watchlistIds: data.watchlistIds,
  });
}
function applyConfiguration(
  data: Extract<LineupAction, { action: "enable" | "delete" | "reorder" }>,
) {
  if (data.action === "enable") return updateLineup(data.reference, { enabled: data.enabled });
  if (data.action === "delete") return deleteLineup(data.reference);
  return reorderLineups(data.references);
}
export type LineupData = Awaited<ReturnType<typeof getLineupData>>;
