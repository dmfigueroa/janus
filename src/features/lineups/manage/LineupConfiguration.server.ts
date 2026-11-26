import { asc, eq } from "drizzle-orm";
import { getDb, type DatabaseTransaction } from "@/db/Db.server";
import { lineups } from "@/db/Schema";
import { lineupSystemKeys, type LineupReference } from "@/features/lineups/LineupReference";
import type { LineupAction } from "@/features/lineups/manage/Lineups";
import {
  findCustomTarget,
  insertLineup,
  lineupFailure,
  replaceMembers,
  updateName,
  validateCustomLineup,
  validateLineupUpdate,
  validWatchlists,
  type CustomLineupInput,
  type LineupChanges,
  type LineupFailure,
} from "@/features/lineups/manage/LineupWriteRules.server";

type SystemLineupKey = (typeof lineupSystemKeys)[number];
type LineupRecord = typeof lineups.$inferSelect;

const defaults = [
  ["movie", "Movies"],
  ["television", "TV"],
  ["game", "Games"],
  ["book", "Books"],
  ["comic", "Comics"],
] as const satisfies ReadonlyArray<readonly [SystemLineupKey, string]>;

export type LineupWithReference = ReturnType<typeof asLineup>;

type LineupChangeResult = { success: true } | LineupFailure;
type SaveLineupResult = { success: true; id: number } | LineupFailure;

// Configuration owns first-use defaults; every write seeds them inside its own transaction.
function initializeLineups(transaction: DatabaseTransaction) {
  defaults.forEach(([key, name], rank) => {
    transaction
      .insert(lineups)
      .values({ kind: "system", systemKey: key, name, rank })
      .onConflictDoNothing({ target: lineups.systemKey })
      .run();
  });
}

function asLineup(lineup: LineupRecord): LineupRecord & { reference: LineupReference } {
  return {
    ...lineup,
    reference:
      lineup.kind === "system"
        ? { kind: "system", key: lineup.systemKey as SystemLineupKey }
        : { kind: "custom", id: lineup.id },
  };
}

function matchesReference(lineup: LineupWithReference, reference: LineupReference) {
  if (lineup.kind !== reference.kind) return false;
  return reference.kind === "custom"
    ? lineup.id === reference.id
    : lineup.systemKey === reference.key;
}

function configuredLineups(transaction: DatabaseTransaction) {
  return transaction.select().from(lineups).orderBy(asc(lineups.rank)).all().map(asLineup);
}

function configuredLineup(transaction: DatabaseTransaction, reference: LineupReference) {
  return configuredLineups(transaction).find((lineup) => matchesReference(lineup, reference));
}

export async function listLineups() {
  return getDb().transaction((transaction) => {
    initializeLineups(transaction);
    return configuredLineups(transaction);
  });
}

export async function findLineup(reference: LineupReference) {
  return (await listLineups()).find((lineup) => matchesReference(lineup, reference));
}

export async function createLineup(name: string) {
  return saveCustomLineup({ name, watchlistIds: [] });
}

export async function updateLineup(
  reference: LineupReference,
  changes: LineupChanges,
): Promise<LineupChangeResult> {
  return getDb().transaction((transaction) => {
    initializeLineups(transaction);
    const existing = configuredLineups(transaction);
    const target = existing.find((lineup) => matchesReference(lineup, reference));
    return target
      ? applyUpdate(transaction, target, changes, existing)
      : lineupFailure("Lineup not found.", { code: "not_found" });
  });
}

function applyUpdate(
  transaction: DatabaseTransaction,
  target: LineupWithReference,
  changes: LineupChanges,
  existing: LineupWithReference[],
): LineupChangeResult {
  const updateFailure = validateLineupUpdate(target, changes, existing);
  if (updateFailure) return updateFailure;
  transaction
    .update(lineups)
    .set({ name: changes.name?.trim(), enabled: changes.enabled })
    .where(eq(lineups.id, target.id))
    .run();
  return { success: true as const };
}

export async function setLineupWatchlists(reference: LineupReference, watchlistIds: number[]) {
  if (reference.kind === "system")
    return lineupFailure("Automatic lineup membership is dynamic.", { code: "forbidden" });
  return getDb().transaction((transaction) => {
    initializeLineups(transaction);
    const target = configuredLineup(transaction, reference);
    if (!target) return lineupFailure("Lineup not found.", { code: "not_found" });
    if (!validWatchlists(transaction, watchlistIds))
      return lineupFailure("Watchlist IDs must be distinct and exist.", {
        code: "validation_error",
      });
    replaceMembers(transaction, target.id, watchlistIds);
    return { success: true as const };
  });
}

export async function saveCustomLineup(input: CustomLineupInput) {
  return getDb().transaction((transaction) => {
    initializeLineups(transaction);
    return saveInTransaction(transaction, input);
  });
}

function saveInTransaction(
  transaction: DatabaseTransaction,
  input: CustomLineupInput,
): SaveLineupResult {
  const existing = transaction.select().from(lineups).all();
  const target = findCustomTarget(existing, input.id);
  const saveFailure = validateCustomLineup(transaction, input, existing, target);
  if (saveFailure) return saveFailure;
  const id = persistLineup(transaction, input, existing, target);
  replaceMembers(transaction, id, input.watchlistIds);
  return { success: true as const, id };
}

function persistLineup(
  transaction: DatabaseTransaction,
  input: CustomLineupInput,
  existing: LineupRecord[],
  target: LineupRecord | undefined,
) {
  if (target) return updateName(transaction, target.id, input.name.trim());
  return insertLineup(transaction, input.name.trim(), existing);
}

export async function deleteLineup(reference: LineupReference) {
  if (reference.kind === "system")
    return lineupFailure("Automatic lineups cannot be deleted.", { code: "forbidden" });
  return getDb().transaction(
    (transaction) => {
      initializeLineups(transaction);
      const target = configuredLineup(transaction, reference);
      if (!target) return lineupFailure("Lineup not found.", { code: "not_found" });
      transaction.delete(lineups).where(eq(lineups.id, target.id)).run();
      return { success: true as const };
    },
    { behavior: "immediate" },
  );
}

export async function reorderLineups(references: LineupReference[]) {
  return getDb().transaction((transaction) => {
    initializeLineups(transaction);
    const existing = configuredLineups(transaction);
    const ordered = references.map((reference) =>
      existing.find((lineup) => matchesReference(lineup, reference)),
    );
    if (!completeOrder(ordered, existing.length))
      return lineupFailure("Provide every lineup exactly once.", { code: "validation_error" });
    ordered.forEach((lineup, rank) => {
      if (lineup) transaction.update(lineups).set({ rank }).where(eq(lineups.id, lineup.id)).run();
    });
    return { success: true as const };
  });
}

export function executeLineupAction(data: LineupAction) {
  if (data.action === "create") return saveCustomLineup(data);
  if (data.action === "edit") return editCustomLineup(data);
  return configureLineup(data);
}

function editCustomLineup(data: Extract<LineupAction, { action: "edit" }>) {
  if (data.reference.kind === "system")
    return lineupFailure("Automatic lineups cannot be edited.", { code: "forbidden" });
  return saveCustomLineup({
    id: data.reference.id,
    name: data.name,
    watchlistIds: data.watchlistIds,
  });
}

function configureLineup(data: Extract<LineupAction, { action: "enable" | "delete" | "reorder" }>) {
  if (data.action === "enable") return updateLineup(data.reference, { enabled: data.enabled });
  if (data.action === "delete") return deleteLineup(data.reference);
  return reorderLineups(data.references);
}

function completeOrder(ordered: Array<LineupWithReference | undefined>, count: number) {
  return (
    ordered.length === count &&
    new Set(ordered.map((lineup) => lineup?.id)).size === count &&
    ordered.every(Boolean)
  );
}
