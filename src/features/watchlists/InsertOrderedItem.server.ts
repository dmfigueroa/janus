import { getDb, type DatabaseTransaction } from "@/db/Db.server";
import { watchlistItems } from "@/db/Schema";
import { toWatchlistItemKey } from "./ItemKey";
import { compareReleaseDates, type InsertionPosition, type WatchlistItemOrderMode } from "./Order";
import { customRankOrder } from "./Order.server";
import { getWatchlistById, markLastItemAddedInTransaction } from "./Repository.server";
import { addedItemsResult, rejectAdd, type WatchlistWriteResult } from "./add/AdditionOutcome";
import { CUSTOM_ORDER_INSERTION_REQUIRED_MESSAGE } from "./add/Constants";
import { and, asc, eq } from "drizzle-orm";

export type { InsertionPosition };

export class InsertItemReferenceError extends Error {
  constructor(public referenceItemId: number) {
    super(`Reference item ${referenceItemId} cannot anchor this insertion.`);
  }
}

export type PendingWatchlistItem = typeof watchlistItems.$inferInsert;
type SelectedItem = typeof watchlistItems.$inferSelect;
export type ItemInsertFields = Omit<SelectedItem, "id" | "watchlistId" | "customRank">;
type ExistingOrderedItem = Pick<
  SelectedItem,
  "id" | "tmdbId" | "mediaType" | "releaseDate" | "customRank"
>;
type OrderedItemSlot = ExistingOrderedItem | (PendingWatchlistItem & { pendingIndex: number });
type PersistBatchInput = {
  watchlistId: number;
  items: PendingWatchlistItem[];
  insertionPosition?: InsertionPosition;
  referenceItemId?: number;
  unchangedCode?: "duplicate" | "no_new_items";
  addedMessage?: string | ((insertedCount: number) => string);
  unchangedMessage?: string;
};

export function validateWatchlistAdditionDestination(input: {
  watchlistId: number;
  insertionPosition?: InsertionPosition;
  transaction?: DatabaseTransaction;
}) {
  const watchlist = getWatchlistById(input.watchlistId, input.transaction);
  if (!watchlist) {
    return { success: false as const, failure: rejectAdd("Watchlist not found.", "not_found") };
  }
  const failure = validateOrderModePosition(watchlist.itemOrderMode, input.insertionPosition);
  return failure
    ? { success: false as const, failure }
    : { success: true as const, itemOrderMode: watchlist.itemOrderMode };
}

function validateOrderModePosition(mode: WatchlistItemOrderMode, position?: InsertionPosition) {
  if (isAnchorPosition(position)) {
    return mode === "custom"
      ? null
      : rejectAdd("Anchored insertion is only available in custom mode.", "not_custom_mode");
  }
  return validateRequiredCustomChoice(mode, position);
}

function validateRequiredCustomChoice(mode: WatchlistItemOrderMode, position?: InsertionPosition) {
  if (mode !== "custom" || position) return null;
  return rejectAdd(CUSTOM_ORDER_INSERTION_REQUIRED_MESSAGE, "insertion_choice_required");
}

function isAnchorPosition(position?: InsertionPosition): position is "before" | "after" {
  return position === "before" || position === "after";
}

export async function persistAddedItems(input: PersistBatchInput): Promise<WatchlistWriteResult> {
  if (input.items.length === 0) return buildOutcome(0, input);
  const persisted = getDb().transaction((transaction) => persistInTransaction(transaction, input));
  return persisted.success ? buildOutcome(persisted.insertedCount, input) : persisted.failure;
}

function buildOutcome(insertedCount: number, input: PersistBatchInput): WatchlistWriteResult {
  const message =
    insertedCount > 0 ? resolveAddedMessage(insertedCount, input) : resolveUnchangedMessage(input);
  return addedItemsResult(insertedCount, message, input.unchangedCode ?? "duplicate");
}

function resolveAddedMessage(insertedCount: number, input: PersistBatchInput): string {
  if (typeof input.addedMessage === "function") return input.addedMessage(insertedCount);
  return input.addedMessage ?? "Added to watchlist";
}

function resolveUnchangedMessage(input: PersistBatchInput): string {
  return input.unchangedMessage ?? "Already in watchlist";
}

function persistInTransaction(transaction: DatabaseTransaction, input: PersistBatchInput) {
  const destination = validateWatchlistAdditionDestination({ ...input, transaction });
  if (!destination.success) return destination;
  const insertion = insertByOrderMode(transaction, destination.itemOrderMode, input);
  recordAddedTimestamp(transaction, input.watchlistId, insertion);
  return insertion;
}

function recordAddedTimestamp(
  transaction: DatabaseTransaction,
  watchlistId: number,
  insertion: { success: boolean; insertedCount?: number },
) {
  if (insertion.success && insertion.insertedCount) {
    markLastItemAddedInTransaction(transaction, watchlistId);
  }
}

function insertByOrderMode(
  transaction: DatabaseTransaction,
  itemOrderMode: WatchlistItemOrderMode,
  input: PersistBatchInput,
) {
  if (itemOrderMode === "custom") return insertCustomOrderedItems(transaction, input);
  const inserted = transaction
    .insert(watchlistItems)
    .values(input.items)
    .onConflictDoNothing()
    .returning({ id: watchlistItems.id })
    .all();
  return { success: true as const, insertedCount: inserted.length };
}

export function insertItemWithCustomOrder(
  transaction: DatabaseTransaction,
  insertFields: ItemInsertFields,
  destinationId: number,
  insertionPosition: InsertionPosition,
  referenceItemId?: number,
): void {
  const items = [{ watchlistId: destinationId, ...insertFields }];
  const input = { watchlistId: destinationId, items, insertionPosition, referenceItemId };
  const result = insertCustomOrderedItems(transaction, input);
  if (!result.success) throw new InsertItemReferenceError(referenceItemId ?? NaN);
}

function insertCustomOrderedItems(transaction: DatabaseTransaction, input: PersistBatchInput) {
  const existing = fetchExistingItems(transaction, input.watchlistId);
  const pending = preparePendingItems(input.items, existing);
  if (pending.length === 0) return { success: true as const, insertedCount: 0 };
  const index = resolveSpliceIndex(existing, input);
  if (index === -1) return invalidReferenceFailure(input.referenceItemId);
  const slots = [...existing.slice(0, index), ...pending, ...existing.slice(index)];
  applyOrderedItemWrites(transaction, input.watchlistId, slots);
  return { success: true as const, insertedCount: pending.length };
}

function fetchExistingItems(transaction: DatabaseTransaction, watchlistId: number) {
  const { id, tmdbId, mediaType, releaseDate, customRank } = watchlistItems;
  return transaction
    .select({ id, tmdbId, mediaType, releaseDate, customRank })
    .from(watchlistItems)
    .where(eq(watchlistItems.watchlistId, watchlistId))
    .orderBy(...customRankOrder, asc(id))
    .all();
}

function preparePendingItems(items: PendingWatchlistItem[], existing: ExistingOrderedItem[]) {
  const seenKeys = new Set(existing.map(toWatchlistItemKey));
  return items
    .filter((item) => {
      const key = toWatchlistItemKey(item);
      return seenKeys.has(key) ? false : Boolean(seenKeys.add(key));
    })
    .map((item, pendingIndex) => ({ ...item, pendingIndex }))
    .sort((left, right) =>
      compareReleaseDates(
        { id: left.pendingIndex, releaseDate: left.releaseDate },
        { id: right.pendingIndex, releaseDate: right.releaseDate },
      ),
    );
}

function resolveSpliceIndex(existing: ExistingOrderedItem[], input: PersistBatchInput): number {
  if (!isAnchorPosition(input.insertionPosition)) {
    return input.insertionPosition === "beginning" ? 0 : existing.length;
  }
  return resolveAnchorIndex(existing, input.insertionPosition, input.referenceItemId);
}

function resolveAnchorIndex(
  existing: ExistingOrderedItem[],
  insertionPosition: "before" | "after",
  referenceItemId?: number,
): number {
  const index = existing.findIndex((item) => item.id === referenceItemId && item.customRank);
  return index === -1 ? -1 : index + Number(insertionPosition === "after");
}

function invalidReferenceFailure(referenceItemId?: number) {
  const message = referenceItemId
    ? `Reference item ${referenceItemId} is not in this watchlist.`
    : "Reference item is required for anchored insertion.";
  return { success: false as const, failure: rejectAdd(message, "invalid_reference") };
}

function applyOrderedItemWrites(
  transaction: DatabaseTransaction,
  watchlistId: number,
  orderedSlots: OrderedItemSlot[],
): void {
  const { id, watchlistId: listId } = watchlistItems;
  orderedSlots.forEach((slot, index) => {
    const customRank = index + 1;
    if ("pendingIndex" in slot) {
      const { pendingIndex: _pendingIndex, ...item } = slot;
      transaction
        .insert(watchlistItems)
        .values({ ...item, customRank })
        .run();
    } else if (slot.customRank !== customRank) {
      const match = and(eq(id, slot.id), eq(listId, watchlistId));
      transaction.update(watchlistItems).set({ customRank }).where(match).run();
    }
  });
}
