import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, type DatabaseTransaction } from "@/db/Db.server";
import { watchlistItems, watchlists, type Watchlist } from "@/db/Schema";
import { buildDetailOrderBy } from "@/features/watchlists/Order.server";
import type { SetWatchlistOrderInput } from "./SetWatchlistOrderSchema";

export type SetWatchlistOrderResult =
  | { success: true; orderToken: string }
  | { success: false; code: SetWatchlistOrderFailureCode; message: string; orderToken?: string };

export type SetWatchlistOrderFailureCode =
  | "not_found"
  | "not_custom_mode"
  | "invalid_order"
  | "stale_order";

export function createWatchlistOrderToken(
  watchlistId: number,
  orderedItemIds: number[],
  itemOrderMode: "release" | "custom",
) {
  return `sha256:${createHash("sha256")
    .update(`${watchlistId}:${itemOrderMode}:${orderedItemIds.join(",")}`)
    .digest("hex")}`;
}

export async function getWatchlistOrderState(watchlistId: number) {
  const db = getDb();
  const [watchlist] = await db
    .select({ id: watchlists.id, itemOrderMode: watchlists.itemOrderMode })
    .from(watchlists)
    .where(eq(watchlists.id, watchlistId));
  if (!watchlist) return null;

  const orderedItemIds = await loadWatchlistOrderedItemIds(watchlist);
  return {
    orderedItemIds,
    orderToken: createWatchlistOrderToken(watchlistId, orderedItemIds, watchlist.itemOrderMode),
  };
}

export async function loadWatchlistOrderedItemIds({
  id: watchlistId,
  itemOrderMode,
}: Pick<Watchlist, "id" | "itemOrderMode">) {
  const items = await getDb()
    .select({ id: watchlistItems.id })
    .from(watchlistItems)
    .where(eq(watchlistItems.watchlistId, watchlistId))
    .orderBy(...buildDetailOrderBy(itemOrderMode));
  return items.map((item) => item.id);
}

export async function getWatchlistOrderToken({
  id,
  itemOrderMode,
}: Pick<Watchlist, "id" | "itemOrderMode">) {
  const orderedItemIds = await loadWatchlistOrderedItemIds({ id, itemOrderMode });
  return createWatchlistOrderToken(id, orderedItemIds, itemOrderMode);
}

export async function setWatchlistOrder({
  watchlistId,
  orderedItemIds,
  expectedOrderToken,
}: SetWatchlistOrderInput): Promise<SetWatchlistOrderResult> {
  return getDb().transaction((transaction) =>
    setWatchlistOrderInTransaction(transaction, {
      watchlistId,
      orderedItemIds,
      expectedOrderToken,
    }),
  );
}

function setWatchlistOrderInTransaction(
  transaction: DatabaseTransaction,
  { watchlistId, orderedItemIds, expectedOrderToken }: SetWatchlistOrderInput,
): SetWatchlistOrderResult {
  const [watchlist] = transaction
    .select({ itemOrderMode: watchlists.itemOrderMode })
    .from(watchlists)
    .where(eq(watchlists.id, watchlistId))
    .all();
  const watchlistFailure = validateWatchlist(watchlist);
  if (watchlistFailure) return watchlistFailure;

  const currentItems = transaction
    .select({ id: watchlistItems.id })
    .from(watchlistItems)
    .where(eq(watchlistItems.watchlistId, watchlistId))
    .orderBy(...buildDetailOrderBy(watchlist.itemOrderMode))
    .all();
  const currentItemIds = currentItems.map((item) => item.id);
  const currentOrderToken = createWatchlistOrderToken(
    watchlistId,
    currentItemIds,
    watchlist.itemOrderMode,
  );

  const orderFailure = validateRequestedOrder(
    orderedItemIds,
    currentItemIds,
    expectedOrderToken,
    currentOrderToken,
  );
  if (orderFailure) return orderFailure;

  applyRanks(transaction, watchlistId, orderedItemIds);

  return {
    success: true,
    orderToken: createWatchlistOrderToken(watchlistId, orderedItemIds, watchlist.itemOrderMode),
  };
}

function applyRanks(
  transaction: DatabaseTransaction,
  watchlistId: number,
  orderedItemIds: number[],
) {
  orderedItemIds.forEach((itemId, index) => {
    transaction
      .update(watchlistItems)
      .set({ customRank: index + 1 })
      .where(and(eq(watchlistItems.id, itemId), eq(watchlistItems.watchlistId, watchlistId)))
      .run();
  });
}

function validateWatchlist(watchlist: { itemOrderMode: "release" | "custom" } | undefined) {
  if (watchlist) {
    if (watchlist.itemOrderMode === "custom") return null;
    return {
      success: false as const,
      code: "not_custom_mode" as const,
      message: "Setting order is only available in custom mode.",
    };
  }
  return { success: false as const, code: "not_found" as const, message: "Watchlist not found." };
}

function validateRequestedOrder(
  candidate: number[],
  current: number[],
  expectedToken: string | undefined,
  currentToken: string,
) {
  if (isStaleOrderToken(expectedToken, currentToken)) {
    return {
      success: false as const,
      code: "stale_order" as const,
      message: "The watchlist order changed. Read it again before setting a new order.",
      orderToken: currentToken,
    };
  }
  if (isCompletePermutation(candidate, current)) return null;
  return {
    success: false as const,
    code: "invalid_order" as const,
    message: "orderedItemIds must contain every watchlist item exactly once.",
    orderToken: currentToken,
  };
}

function isStaleOrderToken(expected: string | undefined, current: string) {
  return expected !== undefined && expected !== current;
}

function isCompletePermutation(candidate: number[], current: number[]) {
  const currentSet = new Set(current);
  return (
    candidate.length === current.length &&
    new Set(candidate).size === candidate.length &&
    candidate.every((itemId) => currentSet.has(itemId))
  );
}
