import type { InsertionPosition } from "@/features/watchlists/Order";
import { InsertItemReferenceError } from "@/features/watchlists/InsertOrderedItem.server";

type HasReleaseDate = { releaseDate?: string | null };

export type ExistingItemSlot = { id: number; customRank: number } & HasReleaseDate;

export type InsertionSlot = { id: number } & HasReleaseDate;
export type GroupInsertionItem = HasReleaseDate;

type SpliceOutcome = number | "invalid_reference";

type AnchorArgs = {
  slots: InsertionSlot[];
  referenceItemId: number | undefined;
  lastInsertedIndex: number;
};

export function planGroupInsertionSlots(args: {
  orderedExisting: ExistingItemSlot[];
  itemsToInsert: readonly GroupInsertionItem[];
  position: InsertionPosition | undefined;
  referenceItemId: number | undefined;
}): InsertionSlot[] {
  const slots: InsertionSlot[] = args.orderedExisting.map((row) => ({
    id: row.id,
    releaseDate: row.releaseDate,
  }));
  let lastInsertedIndex = -1;

  for (const item of args.itemsToInsert) {
    const spliceIndex = nextSpliceIndex(
      slots,
      args.position,
      args.referenceItemId,
      lastInsertedIndex,
    );
    lastInsertedIndex = applySplice(slots, spliceIndex, args.referenceItemId, item);
  }

  return slots;
}

function nextSpliceIndex(
  slots: InsertionSlot[],
  position: InsertionPosition | undefined,
  referenceItemId: number | undefined,
  lastInsertedIndex: number,
): SpliceOutcome {
  if (position === "before" || position === "after") {
    return anchorSpliceIndex({ slots, referenceItemId, lastInsertedIndex }, position);
  }
  return legacySpliceIndex(slots, position);
}

function anchorSpliceIndex(args: AnchorArgs, direction: "before" | "after"): SpliceOutcome {
  const chained = chainedInsertIndex(args);
  if (chained !== null) {
    return chained;
  }
  return firstAnchorSpliceIndex(args, direction);
}

function chainedInsertIndex(args: AnchorArgs): number | null {
  if (args.lastInsertedIndex === -1) {
    return null;
  }
  return args.lastInsertedIndex + 1;
}

function firstAnchorSpliceIndex(args: AnchorArgs, direction: "before" | "after"): SpliceOutcome {
  const refIndex = findReferenceIndex(args);
  if (refIndex === "invalid_reference") {
    return "invalid_reference";
  }
  return direction === "before" ? refIndex : refIndex + 1;
}

function findReferenceIndex(args: AnchorArgs): SpliceOutcome {
  if (args.referenceItemId === undefined) {
    return "invalid_reference";
  }
  const index = args.slots.findIndex((slot) => slot.id === args.referenceItemId);
  return index === -1 ? "invalid_reference" : index;
}

function legacySpliceIndex(
  slots: InsertionSlot[],
  position: InsertionPosition | undefined,
): number {
  return position === "beginning" ? 0 : slots.length;
}

function applySplice(
  slots: InsertionSlot[],
  spliceIndex: SpliceOutcome,
  referenceItemId: number | undefined,
  item: GroupInsertionItem,
): number {
  if (spliceIndex === "invalid_reference") {
    throw new InsertItemReferenceError(referenceItemId ?? NaN);
  }
  slots.splice(spliceIndex, 0, { id: 0, releaseDate: item.releaseDate });
  return spliceIndex;
}
