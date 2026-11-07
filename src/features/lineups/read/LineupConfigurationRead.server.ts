import { asc } from "drizzle-orm";
import { getDb, type DatabaseTransaction } from "@/db/Db.server";
import { lineups } from "@/db/Schema";

const defaults = [
  { key: "movie", name: "Movies" },
  { key: "television", name: "TV" },
  { key: "game", name: "Games" },
  { key: "book", name: "Books" },
  { key: "comic", name: "Comics" },
] as const;

// Configuration owns first-use defaults; callers never perform setup themselves.
export function initializeLineups(transaction: DatabaseTransaction) {
  defaults.forEach(({ key, name }, rank) => {
    transaction
      .insert(lineups)
      .values({ kind: "system", systemKey: key, name, rank })
      .onConflictDoNothing({ target: lineups.systemKey })
      .run();
  });
}
export async function listLineups() {
  return getDb().transaction((transaction) => {
    initializeLineups(transaction);
    return transaction.select().from(lineups).orderBy(asc(lineups.rank)).all().map(asLineup);
  });
}
export function asLineup(lineup: typeof lineups.$inferSelect) {
  return {
    ...lineup,
    reference:
      lineup.kind === "system"
        ? { kind: "system" as const, key: lineup.systemKey! }
        : { kind: "custom" as const, id: lineup.id },
  };
}

export type LineupReference =
  | { kind: "system"; key: (typeof defaults)[number]["key"] }
  | { kind: "custom"; id: number };

export function matchesReference(
  lineup: Awaited<ReturnType<typeof listLineups>>[number],
  reference: LineupReference,
) {
  if (lineup.kind !== reference.kind) return false;
  return reference.kind === "custom"
    ? lineup.id === reference.id
    : lineup.systemKey === reference.key;
}
