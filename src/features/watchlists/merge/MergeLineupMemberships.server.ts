import { inArray } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/Db.server";
import { lineupWatchlists } from "@/db/Schema";
export function mergeLineupMemberships(
  transaction: DatabaseTransaction,
  sourceIds: number[],
  targetId: number,
) {
  const memberships = transaction
    .select()
    .from(lineupWatchlists)
    .where(inArray(lineupWatchlists.watchlistId, sourceIds))
    .all();
  if (memberships.length)
    transaction
      .insert(lineupWatchlists)
      .values(memberships.map(({ lineupId }) => ({ lineupId, watchlistId: targetId })))
      .onConflictDoNothing()
      .run();
}
