import { eq, inArray } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/Db.server";
import { lineups, lineupWatchlists, watchlists } from "@/db/Schema";
import { unicodeCaseFold } from "@/db/UnicodeCaseFold.server";

type LineupRecord = typeof lineups.$inferSelect;
type LineupIdentity = Pick<LineupRecord, "id" | "kind" | "name">;

export type LineupFailure = {
  success: false;
  code: "validation_error" | "not_found" | "forbidden";
  field?: "name";
  message: string;
};

export type LineupChanges = { name?: string; enabled?: boolean };
export type CustomLineupInput = { id?: number; name: string; watchlistIds: number[] };

export function lineupFailure(
  message: string,
  details: Pick<LineupFailure, "code"> & Partial<Pick<LineupFailure, "field">>,
): LineupFailure {
  return { success: false, ...details, message };
}

export function validateLineupUpdate(
  target: LineupIdentity,
  changes: LineupChanges,
  existing: LineupIdentity[],
): LineupFailure | null {
  if (noChanges(changes))
    return lineupFailure("Provide a name or enabled state.", { code: "validation_error" });
  return validateChangedUpdate(target, changes, existing);
}

function validateChangedUpdate(
  target: LineupIdentity,
  changes: LineupChanges,
  existing: LineupIdentity[],
) {
  if (changes.name !== undefined && target.kind === "system")
    return lineupFailure("Automatic lineups cannot be renamed.", { code: "forbidden" });
  return nameUpdateFailure(changes.name, existing, target.id);
}

function nameUpdateFailure(name: string | undefined, existing: LineupIdentity[], id: number) {
  if (name === undefined) return null;
  const nameFailure = validateCustomName(name, existing, id);
  return nameFailure
    ? lineupFailure(nameFailure.message, { code: "validation_error", field: nameFailure.field })
    : null;
}

function noChanges(changes: LineupChanges) {
  return changes.name === undefined && changes.enabled === undefined;
}

export function validateCustomLineup(
  transaction: DatabaseTransaction,
  input: CustomLineupInput,
  existing: LineupRecord[],
  target: LineupRecord | undefined,
) {
  if (missingSaveTarget(input, target))
    return lineupFailure("Lineup not found.", { code: "not_found" });
  const nameFailure = validateCustomName(input.name, existing, targetId(target));
  if (nameFailure)
    return lineupFailure(nameFailure.message, {
      code: "validation_error",
      field: nameFailure.field,
    });
  return watchlistFailure(transaction, input.watchlistIds);
}

function missingSaveTarget(input: CustomLineupInput, target: LineupRecord | undefined) {
  return input.id !== undefined && target === undefined;
}

function targetId(target: LineupRecord | undefined) {
  if (target === undefined) return undefined;
  return target.id;
}

function watchlistFailure(transaction: DatabaseTransaction, watchlistIds: number[]) {
  if (!validWatchlists(transaction, watchlistIds))
    return lineupFailure("One or more watchlists no longer exist.", { code: "validation_error" });
  return null;
}

export function findCustomTarget(existing: LineupRecord[], id: number | undefined) {
  return existing.find((entry) => entry.id === id && entry.kind === "custom");
}

function validateCustomName(name: string, existing: LineupIdentity[], id?: number) {
  const trimmed = name.trim();
  if (!trimmed) return { field: "name" as const, message: "Enter a name for this lineup." };
  const match = existing.find(
    (entry) => entry.id !== id && unicodeCaseFold(entry.name) === unicodeCaseFold(trimmed),
  );
  if (!match) return null;
  return { field: "name" as const, message: nameConflictMessage(match) };
}

function nameConflictMessage(match: LineupIdentity) {
  return match.kind === "system"
    ? `${match.name} is reserved for an automatic lineup.`
    : "That lineup name is already used.";
}

export function validWatchlists(transaction: DatabaseTransaction, watchlistIds: number[]) {
  const count = transaction
    .select()
    .from(watchlists)
    .where(inArray(watchlists.id, watchlistIds))
    .all().length;
  return new Set(watchlistIds).size === watchlistIds.length && count === watchlistIds.length;
}

export function updateName(transaction: DatabaseTransaction, id: number, name: string) {
  transaction.update(lineups).set({ name }).where(eq(lineups.id, id)).run();
  return id;
}

export function insertLineup(
  transaction: DatabaseTransaction,
  name: string,
  existing: LineupRecord[],
) {
  const rank = Math.max(-1, ...existing.map((entry) => entry.rank)) + 1;
  return transaction.insert(lineups).values({ kind: "custom", name, rank }).returning().get().id;
}

export function replaceMembers(
  transaction: DatabaseTransaction,
  id: number,
  watchlistIds: number[],
) {
  transaction.delete(lineupWatchlists).where(eq(lineupWatchlists.lineupId, id)).run();
  if (watchlistIds.length)
    transaction
      .insert(lineupWatchlists)
      .values(watchlistIds.map((watchlistId) => ({ lineupId: id, watchlistId })))
      .run();
}
