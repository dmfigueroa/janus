import { eq, inArray } from "drizzle-orm";
import { getDb, type DatabaseTransaction } from "@/db/Db.server";
import { lineups, lineupWatchlists, watchlists } from "@/db/Schema";
import { unicodeCaseFold } from "@/db/UnicodeCaseFold.server";
import { listLineups } from "@/features/lineups/manage/Lineups.server";

type Input = { id?: number; name: string; watchlistIds: number[] };
type Record = typeof lineups.$inferSelect;
export async function saveCustomLineup(input: Input) {
  await listLineups();
  return getDb().transaction((transaction) =>
    saveInTransaction(transaction, { ...input, name: input.name.trim() }),
  );
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
function findTarget(existing: Record[], id: number | undefined) {
  return existing.find((entry) => entry.id === id && entry.kind === "custom");
}
function validateInput(
  transaction: DatabaseTransaction,
  input: Input,
  existing: Record[],
  target: Record | undefined,
) {
  const nameFailure = validateIdentity(input, existing, target);
  if (nameFailure) return nameFailure;
  if (!validWatchlists(transaction, input.watchlistIds))
    return { message: "One or more watchlists no longer exist." };
  return null;
}
function validateIdentity(input: Input, existing: Record[], target: Record | undefined) {
  if (missingTarget(input.id, target)) return { message: "Lineup not found." };
  return validateName(input, existing);
}
function missingTarget(id: number | undefined, target: Record | undefined) {
  return id !== undefined && !target;
}
function validateName(input: Input, existing: Record[]) {
  if (!input.name) return { field: "name" as const, message: "Enter a name for this lineup." };
  const match = existing.find(
    (entry) => entry.id !== input.id && unicodeCaseFold(entry.name) === unicodeCaseFold(input.name),
  );
  if (!match) return null;
  return { field: "name" as const, message: nameConflictMessage(match) };
}
function nameConflictMessage(match: Record) {
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
function insertLineup(transaction: DatabaseTransaction, name: string, existing: Record[]) {
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
