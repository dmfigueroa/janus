import { eq } from "drizzle-orm";
import { getDb } from "@/db/Db.server";
import { lineups } from "@/db/Schema";
import {
  listLineups,
  matchesReference,
  type LineupReference,
} from "@/features/lineups/read/LineupConfigurationRead.server";

export async function deleteLineup(reference: LineupReference) {
  if (reference.kind === "system")
    return {
      success: false as const,
      code: "forbidden",
      message: "Automatic lineups cannot be deleted.",
    };
  const target = (await listLineups()).find((lineup) => matchesReference(lineup, reference));
  if (!target) return { success: false as const, code: "not_found", message: "Lineup not found." };
  getDb().delete(lineups).where(eq(lineups.id, target.id)).run();
  return { success: true as const };
}
