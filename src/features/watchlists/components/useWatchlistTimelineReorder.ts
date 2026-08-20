import {
  MouseSensor,
  TouchSensor,
  type DragEndEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useEffect, useMemo, useState } from "react";
import type { WatchlistItem } from "@/db/Schema";
import type { WatchlistItemOrderMode } from "@/features/watchlists/Order";
import {
  reorderVisibleItemsByAnchor,
  resolveReorderIntent,
  type ReorderIntent,
} from "@/features/watchlists/detail/Reorder";
import { reorderItemsByIds, shouldResetOptimisticOrder } from "./WatchlistTimeline.model";

interface UseWatchlistTimelineReorderOptions {
  items: WatchlistItem[];
  itemOrderMode: WatchlistItemOrderMode;
  canReorder: boolean;
  reorderFailed: boolean;
  onReorder?: (intent: ReorderIntent) => void;
}

export function useWatchlistTimelineReorder({
  items,
  itemOrderMode,
  canReorder,
  reorderFailed,
  onReorder,
}: UseWatchlistTimelineReorderOptions) {
  const [activeItemId, setActiveItemId] = useState<number | null>(null);
  const [localOrderIds, setLocalOrderIds] = useState<number[] | null>(null);
  const reorderEnabled = isReorderEnabled(canReorder, onReorder);
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const displayedItems = useMemo(
    () => (localOrderIds ? reorderItemsByIds(items, localOrderIds) : items),
    [items, localOrderIds],
  );
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

  useEffect(() => {
    if (itemOrderMode !== "custom") {
      setLocalOrderIds(null);
      return;
    }

    if (shouldResetOptimisticOrder(itemIds, localOrderIds)) {
      setLocalOrderIds(null);
    }
  }, [itemIds, itemOrderMode, localOrderIds]);

  useEffect(() => {
    if (reorderFailed) {
      setLocalOrderIds(null);
    }
  }, [reorderFailed]);

  function handleDragStart(event: DragStartEvent) {
    setActiveItemId(Number(event.active.id));
  }

  function handleDragCancel() {
    setActiveItemId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!reorderEnabled) {
      handleDragCancel();
      return;
    }

    const attempt = buildDragEventReorderAttempt(displayedItems, activeItemId, event);

    if (!attempt) {
      handleDragCancel();
      return;
    }

    blurActiveElement();
    setLocalOrderIds(attempt.nextItemIds);
    setActiveItemId(null);
    notifyReorder(onReorder, attempt.intent);
  }

  return {
    activeItem,
    displayedItems,
    handleDragCancel,
    handleDragEnd,
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

function notifyReorder(
  onReorder: UseWatchlistTimelineReorderOptions["onReorder"],
  intent: ReorderIntent,
) {
  onReorder?.(intent);
}

function buildReorderAttempt(items: WatchlistItem[], movedItemId: number, referenceItemId: number) {
  const movedIndex = items.findIndex((item) => item.id === movedItemId);
  const referenceIndex = items.findIndex((item) => item.id === referenceItemId);
  const indexes = getValidReorderIndexes(movedIndex, referenceIndex);
  if (!indexes) return null;

  const position = getReorderPosition(indexes.moved, indexes.reference);
  const nextItemIds = reorderVisibleItemsByAnchor({
    items,
    movedItemId,
    referenceItemId,
    position,
  });
  const intent = resolveReorderIntent({
    items,
    movedItemId,
    referenceItemId,
    position,
  });

  if (!intent) {
    return null;
  }

  return buildReorderAttemptResult(intent, nextItemIds);
}

function getValidReorderIndexes(moved: number, reference: number) {
  if (moved < 0) return null;
  if (reference < 0) return null;
  return { moved, reference };
}

function getReorderPosition(movedIndex: number, referenceIndex: number) {
  return movedIndex < referenceIndex ? ("after" as const) : ("before" as const);
}

function buildReorderAttemptResult(intent: ReorderIntent, nextItemIds: number[] | null) {
  if (!nextItemIds) {
    return null;
  }

  return { intent, nextItemIds };
}

function blurActiveElement() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}
