import { eq, inArray } from "drizzle-orm";
import { getDb, type DatabaseTransaction } from "@/db/Db.server";
import { lineups, lineupWatchlists, watchlists } from "@/db/Schema";
import { unicodeCaseFold } from "@/db/UnicodeCaseFold.server";

import {
  initializeLineups,
  listLineups,
  asLineup,
  matchesReference,
  type LineupReference,
} from "@/features/lineups/read/LineupConfigurationRead.server";

export async function createLineup(name: string) {
  return saveCustomLineup({ name, watchlistIds: [] });
}

export async function updateLineup(
  reference: LineupReference,
  changes: { name?: string; enabled?: boolean },
) {
  return getDb().transaction((transaction) => {
    initializeLineups(transaction);
    return updateInTransaction(transaction, reference, changes);
  });
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
    .set({ name: changes.name?.trim(), enabled: changes.enabled })
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
  if (reference.kind === "system" && name !== undefined)
    return {
      success: false as const,
      code: "forbidden",
      message: "Automatic lineups cannot be renamed.",
    };
  return validateName(name, existing, id);
}

function validateName(
  name: string | undefined,
  existing: Awaited<ReturnType<typeof listLineups>>,
  id: number,
) {
  if (name === undefined) return null;
  return validateCustomName(name.trim(), existing, id)
    ? {
        success: false as const,
        code: "validation_error",
        message: "A unique lineup name is required.",
      }
    : null;
}

export async function setLineupWatchlists(reference: LineupReference, ids: number[]) {
  if (reference.kind === "system")
    return {
      success: false as const,
      code: "forbidden",
      message: "Automatic lineup membership is dynamic.",
    };
  return getDb().transaction((transaction) => {
    initializeLineups(transaction);
    const target = transaction
      .select()
      .from(lineups)
      .all()
      .map(asLineup)
      .find((lineup) => matchesReference(lineup, reference));
    if (!target)
      return { success: false as const, code: "not_found", message: "Lineup not found." };
    if (!validWatchlists(transaction, ids))
      return {
        success: false as const,
        code: "validation_error",
        message: "Watchlist IDs must be distinct and exist.",
      };
    replaceMembers(transaction, target.id, ids);
    return { success: true as const };
  });
}

type Input = { id?: number; name: string; watchlistIds: number[] };
type LineupRecord = typeof lineups.$inferSelect;
export async function saveCustomLineup(input: Input) {
  return getDb().transaction((transaction) => {
    initializeLineups(transaction);
    return saveInTransaction(transaction, { ...input, name: input.name.trim() });
  });
}
function saveInTransaction(transaction: DatabaseTransaction, input: Input) {
  const existing = transaction.select().from(lineups).all();
  const target = findTarget(existing, input.id);
  const failure = validateInput(transaction, input, existing, target);
  if (failure) return { success: false as const, ...failure };
  const id = target
    ? updateName(transaction, target.id, input.name)
    : insertLineup(transaction, input.name, existing);
  replaceMembers(transaction, id, input.watchlistIds);
  return { success: true as const, id };
}
function findTarget(existing: LineupRecord[], id: number | undefined) {
  return existing.find((entry) => entry.id === id && entry.kind === "custom");
}
function validateInput(
  transaction: DatabaseTransaction,
  input: Input,
  existing: LineupRecord[],
  target: LineupRecord | undefined,
) {
  const nameFailure = validateIdentity(input, existing, target);
  if (nameFailure) return nameFailure;
  if (!validWatchlists(transaction, input.watchlistIds))
    return { message: "One or more watchlists no longer exist." };
  return null;
}

function validateCustomName(name: string, existing: LineupRecord[], id?: number) {
  if (!name) return { field: "name" as const, message: "Enter a name for this lineup." };
  const match = existing.find(
    (entry) => entry.id !== id && unicodeCaseFold(entry.name) === unicodeCaseFold(name),
  );
  if (!match) return null;
  return { field: "name" as const, message: nameConflictMessage(match) };
}
function nameConflictMessage(match: LineupRecord) {
  return match.kind === "system"
    ? `${match.name} is reserved for an automatic lineup.`
    : "That lineup name is already used.";
}
function validWatchlists(transaction: DatabaseTransaction, ids: number[]) {
  const count = transaction
    .select()
    .from(watchlists)
    .where(inArray(watchlists.id, ids))
    .all().length;
  return new Set(ids).size === ids.length && count === ids.length;
}
function updateName(transaction: DatabaseTransaction, id: number, name: string) {
  transaction.update(lineups).set({ name }).where(eq(lineups.id, id)).run();
  return id;
}
function insertLineup(transaction: DatabaseTransaction, name: string, existing: LineupRecord[]) {
  const rank = Math.max(-1, ...existing.map((entry) => entry.rank)) + 1;
  return transaction.insert(lineups).values({ kind: "custom", name, rank }).returning().get().id;
}
function replaceMembers(transaction: DatabaseTransaction, id: number, ids: number[]) {
  transaction.delete(lineupWatchlists).where(eq(lineupWatchlists.lineupId, id)).run();
  if (ids.length)
    transaction
      .insert(lineupWatchlists)
      .values(ids.map((watchlistId) => ({ lineupId: id, watchlistId })))
      .run();
}

function noChanges(changes: { name?: string; enabled?: boolean }) {
  return changes.name === undefined && changes.enabled === undefined;
}

function validateIdentity(
  input: Input,
  existing: LineupRecord[],
  target: LineupRecord | undefined,
) {
  if (input.id !== undefined && !target) return { message: "Lineup not found." };
  return validateCustomName(input.name, existing, input.id);
}
