import type { InsertionPosition } from "@/features/watchlists/Order";
import { InsertItemReferenceError } from "@/features/watchlists/InsertOrderedItem.server";

export type ExistingItemSlot = { id: number; customRank: number };

export type InsertionSlot = { id: number };

type SpliceOutcome = number | "invalid_reference";

type AnchorArgs = {
  slots: InsertionSlot[];
  referenceItemId: number | undefined;
  lastInsertedIndex: number;
};

export function planGroupInsertionSlots(args: {
  orderedExisting: ExistingItemSlot[];
  itemsToInsert: number;
  position: InsertionPosition | undefined;
  referenceItemId: number | undefined;
}): InsertionSlot[] {
  const slots: InsertionSlot[] = args.orderedExisting.map((row) => ({ id: row.id }));
  let lastInsertedIndex = -1;

  for (let i = 0; i < args.itemsToInsert; i += 1) {
    const spliceIndex = nextSpliceIndex(
      slots,
      args.position,
      args.referenceItemId,
      lastInsertedIndex,
    );
    lastInsertedIndex = applySplice(slots, spliceIndex, args.referenceItemId);
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
  if (position === "beginning") {
    return 0;
  }
  return slots.length;
}

function applySplice(
  slots: InsertionSlot[],
  spliceIndex: SpliceOutcome,
  referenceItemId: number | undefined,
): number {
  if (spliceIndex === "invalid_reference") {
    throw new InsertItemReferenceError(referenceItemId ?? NaN);
  }
  slots.splice(spliceIndex, 0, { id: 0 });
  return spliceIndex;
}
