import {
  MouseSensor,
  TouchSensor,
  type DragEndEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useState } from "react";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import { resolveReorderIntent, type ReorderIntent } from "@/features/watchlists/detail/Reorder";

interface UseWatchlistTimelineReorderOptions {
  items: WatchlistItem[];
  itemOrderMode: WatchlistItemOrderMode;
  canReorder: boolean;
  onReorder?: (intent: ReorderIntent) => Promise<boolean> | void;
}

export function useWatchlistTimelineReorder({
  items,
  itemOrderMode,
  canReorder,
  onReorder,
}: UseWatchlistTimelineReorderOptions) {
  const [drag, setDrag] = useState<{ itemId: number; items: WatchlistItem[] } | null>(null);
  const reorderEnabled = isReorderEnabled(canReorder && itemOrderMode === "custom", onReorder);
  // Keep the sortable input stable until drag end. A cache notification during
  // drop preparation must not apply the drag displacement to the new order.
  const { items: displayedItems, itemId: activeItemId } = drag ?? { items, itemId: null };
  const activeItem = findActiveItem(displayedItems, activeItemId);
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    }),
  );

  function handleDragStart(event: DragStartEvent) {
    if (reorderEnabled) setDrag({ itemId: Number(event.active.id), items });
  }

  function handleDragCancel() {
    setDrag(null);
  }

  async function prepareDrop(event: DragEndEvent) {
    if (!reorderEnabled) return true;
    const attempt = buildDragEventReorderAttempt(displayedItems, activeItemId, event);
    if (!attempt) return true;

    return finishDropPreparation(onReorder, attempt);
  }

  function handleDragEnd() {
    blurActiveElement();
    setDrag(null);
  }

  return {
    activeItem,
    displayedItems,
    handleDragCancel,
    handleDragEnd,
    prepareDrop,
    handleDragStart,
    reorderEnabled,
    sensors,
  };
}

function isReorderEnabled(
  canReorder: boolean,
  onReorder: UseWatchlistTimelineReorderOptions["onReorder"],
) {
  return canReorder && Boolean(onReorder);
}

function findActiveItem(items: WatchlistItem[], activeItemId: number | null) {
  if (activeItemId === null) {
    return null;
  }

  return items.find((item) => item.id === activeItemId) ?? null;
}

function buildDragEventReorderAttempt(
  items: WatchlistItem[],
  activeItemId: number | null,
  event: DragEndEvent,
) {
  if (activeItemId === null) {
    return null;
  }

  if (!event.over) {
    return null;
  }

  return buildReorderAttempt(items, activeItemId, Number(event.over.id));
}

function buildReorderAttempt(items: WatchlistItem[], movedItemId: number, referenceItemId: number) {
  const movedIndex = items.findIndex((item) => item.id === movedItemId);
  const referenceIndex = items.findIndex((item) => item.id === referenceItemId);
  const indexes = getValidReorderIndexes(movedIndex, referenceIndex);
  if (!indexes) return null;

  const position = getReorderPosition(indexes.moved, indexes.reference);
  const intent = resolveReorderIntent({
    items,
    movedItemId,
    referenceItemId,
    position,
  });

  if (!intent) {
    return null;
  }

  return intent;
}

function getValidReorderIndexes(moved: number, reference: number) {
  if (moved < 0) return null;
  if (reference < 0) return null;
  return { moved, reference };
}

function getReorderPosition(movedIndex: number, referenceIndex: number) {
  return movedIndex < referenceIndex ? ("after" as const) : ("before" as const);
}

function blurActiveElement() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

async function finishDropPreparation(
  onReorder: UseWatchlistTimelineReorderOptions["onReorder"],
  intent: ReorderIntent,
) {
  const prepared = await onReorder?.(intent);
  if (prepared === false) return true;
  // Query observers notify asynchronously. Retain the overlay until React has
  // committed the optimistic cache order before ending the drag.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  return false;
}
