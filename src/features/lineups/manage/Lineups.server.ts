import { asc, eq } from "drizzle-orm";
import { getDb, type DatabaseTransaction } from "@/db/Db.server";
import { lineups } from "@/db/Schema";
import { unicodeCaseFold } from "@/db/UnicodeCaseFold.server";

const defaults = [
  { key: "movie", name: "Movies" },
  { key: "television", name: "TV" },
  { key: "game", name: "Games" },
  { key: "book", name: "Books" },
  { key: "comic", name: "Comics" },
] as const;

export async function listLineups() {
  const db = getDb();
  db.transaction((transaction) => {
    defaults.forEach(({ key, name }, rank) => {
      transaction
        .insert(lineups)
        .values({ kind: "system", systemKey: key, name, rank })
        .onConflictDoNothing({ target: lineups.systemKey })
        .run();
    });
  });
  return db.select().from(lineups).orderBy(asc(lineups.rank)).all().map(asLineup);
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

export async function createLineup(name: string) {
  const { saveCustomLineup } = await import("@/features/lineups/manage/SaveCustomLineup.server");
  return saveCustomLineup({ name, watchlistIds: [] });
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

export async function updateLineup(
  reference: LineupReference,
  changes: { name?: string; enabled?: boolean },
) {
  await listLineups();
  return getDb().transaction((transaction) => updateInTransaction(transaction, reference, changes));
}
function updateInTransaction(
  transaction: DatabaseTransaction,
  reference: LineupReference,
  changes: { name?: string; enabled?: boolean },
) {
  const existing = transaction.select().from(lineups).all().map(asLineup);
  const target = existing.find((lineup) => matchesReference(lineup, reference));
  if (!target) return { success: false as const, code: "not_found", message: "Lineup not found." };
  if (noChanges(changes))
    return {
      success: false as const,
      code: "validation_error",
      message: "Provide a name or enabled state.",
    };
  return applyUpdate(transaction, reference, changes, existing, target.id);
}
function noChanges(changes: { name?: string; enabled?: boolean }) {
  return changes.name === undefined && changes.enabled === undefined;
}
function applyUpdate(
  transaction: DatabaseTransaction,
  reference: LineupReference,
  changes: { name?: string; enabled?: boolean },
  existing: Awaited<ReturnType<typeof listLineups>>,
  id: number,
) {
  const failure = validateUpdate(reference, changes.name, existing, id);
  if (failure) return failure;
  transaction
    .update(lineups)
    .set({ name: trimOptional(changes.name), enabled: changes.enabled })
    .where(eq(lineups.id, id))
    .run();
  return { success: true as const };
}
function validateUpdate(
  reference: LineupReference,
  name: string | undefined,
  existing: Awaited<ReturnType<typeof listLineups>>,
  id: number,
) {
  if (isSystemRename(reference, name))
    return {
      success: false as const,
      code: "forbidden",
      message: "Automatic lineups cannot be renamed.",
    };
  return validateName(name, existing, id);
}
function trimOptional(name: string | undefined) {
  return name?.trim();
}
function validateName(
  name: string | undefined,
  existing: Awaited<ReturnType<typeof listLineups>>,
  id: number,
) {
  if (name === undefined) return null;
  return isAvailableName(name.trim(), existing, id)
    ? null
    : {
        success: false as const,
        code: "validation_error",
        message: "A unique lineup name is required.",
      };
}

function isSystemRename(reference: LineupReference, name?: string) {
  return reference.kind === "system" && name !== undefined;
}
function isAvailableName(
  name: string,
  existing: Awaited<ReturnType<typeof listLineups>>,
  id: number,
) {
  return (
    Boolean(name) &&
    !existing.some(
      (lineup) => lineup.id !== id && unicodeCaseFold(lineup.name) === unicodeCaseFold(name),
    )
  );
}

export async function setLineupWatchlists(reference: LineupReference, ids: number[]) {
  if (reference.kind === "system")
    return {
      success: false as const,
      code: "forbidden",
      message: "Automatic lineup membership is dynamic.",
    };
  const target = (await listLineups()).find((lineup) => matchesReference(lineup, reference));
  if (!target) return { success: false as const, code: "not_found", message: "Lineup not found." };
  return replaceWatchlists(target.id, ids);
}
async function replaceWatchlists(lineupId: number, ids: number[]) {
  const { eq, inArray } = await import("drizzle-orm");
  const { lineupWatchlists, watchlists } = await import("@/db/Schema");
  const db = getDb();
  const foundCount = db.select().from(watchlists).where(inArray(watchlists.id, ids)).all().length;
  if (!validMembers(ids, foundCount))
    return {
      success: false as const,
      code: "validation_error",
      message: "Watchlist IDs must be distinct and exist.",
    };
  db.transaction((transaction) => {
    transaction.delete(lineupWatchlists).where(eq(lineupWatchlists.lineupId, lineupId)).run();
    if (ids.length)
      transaction
        .insert(lineupWatchlists)
        .values(ids.map((watchlistId) => ({ lineupId, watchlistId })))
        .run();
  });
  return { success: true as const };
}
function validMembers(ids: number[], foundCount: number) {
  return new Set(ids).size === ids.length && foundCount === ids.length;
}

export async function deleteLineup(reference: LineupReference) {
  const { eq } = await import("drizzle-orm");
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

export { reorderLineups } from "@/features/lineups/manage/ReorderLineups.server";
export { readLineups } from "@/features/lineups/read/LineupRead.server";
export { saveCustomLineup } from "@/features/lineups/manage/SaveCustomLineup.server";
