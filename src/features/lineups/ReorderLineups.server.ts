import { getDb } from "@/db/Db.server";
import { lineups } from "@/db/Schema";
import { listLineups, matchesReference, type LineupReference } from "./Lineups.server";

export async function reorderLineups(references: LineupReference[]) {
  const { eq } = await import("drizzle-orm");
  const existing = await listLineups();
  const ordered = references.map((reference) =>
    existing.find((lineup) => matchesReference(lineup, reference)),
  );
  if (!completeOrder(ordered, existing.length))
    return {
      success: false as const,
      code: "validation_error",
      message: "Provide every lineup exactly once.",
    };
  getDb().transaction((transaction) =>
    ordered.forEach((lineup, rank) => {
      if (lineup) transaction.update(lineups).set({ rank }).where(eq(lineups.id, lineup.id)).run();
    }),
  );
  return { success: true as const };
}

function completeOrder(
  ordered: Array<Awaited<ReturnType<typeof listLineups>>[number] | undefined>,
  count: number,
) {
  return (
    ordered.length === count &&
    new Set(ordered.map((lineup) => lineup?.id)).size === count &&
    ordered.every(Boolean)
  );
}
